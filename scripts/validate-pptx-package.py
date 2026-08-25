#!/usr/bin/env python3
"""Validate the OOXML package relationships used by app-generated PPTX reports."""

import argparse
import json
import posixpath
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"


def relationship_source(rel_path):
    if rel_path == "_rels/.rels":
        return ""
    marker = "/_rels/"
    if marker not in rel_path or not rel_path.endswith(".rels"):
        return None
    prefix, rel_name = rel_path.split(marker, 1)
    return posixpath.join(prefix, rel_name[:-5])


def local_name(tag):
    return tag.rsplit("}", 1)[-1]


def validate(path):
    errors = []
    warnings = []
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        corrupt_member = archive.testzip()
        if corrupt_member:
            errors.append(f"CRC failure: {corrupt_member}")

        required = {"[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml"}
        for missing in sorted(required - names):
            errors.append(f"Missing required package member: {missing}")

        parsed = {}
        for name in sorted(names):
            if not (name.endswith(".xml") or name.endswith(".rels")):
                continue
            try:
                parsed[name] = ET.fromstring(archive.read(name))
            except ET.ParseError as error:
                errors.append(f"Malformed XML in {name}: {error}")

        content_types = parsed.get("[Content_Types].xml")
        if content_types is not None:
            for override in content_types.findall(f"{{{CT_NS}}}Override"):
                part_name = (override.get("PartName") or "").lstrip("/")
                if part_name and part_name not in names:
                    errors.append(f"Content type override targets a missing part: {part_name}")

        for rel_path, root in parsed.items():
            if not rel_path.endswith(".rels"):
                continue
            source = relationship_source(rel_path)
            if source is None:
                continue
            source_dir = posixpath.dirname(source)
            for relationship in root.findall(f"{{{REL_NS}}}Relationship"):
                if relationship.get("TargetMode") == "External":
                    continue
                target = relationship.get("Target") or ""
                resolved = posixpath.normpath(posixpath.join(source_dir, target)).lstrip("/")
                if resolved not in names:
                    errors.append(f"Broken relationship in {rel_path}: {target} -> {resolved}")

        slide_paths = sorted(
            name for name in names
            if name.startswith("ppt/slides/slide") and name.endswith(".xml")
        )
        for slide_path in slide_paths:
            root = parsed.get(slide_path)
            if root is None:
                continue
            shape_ids = [
                element.get("id")
                for element in root.iter()
                if local_name(element.tag) == "cNvPr" and element.get("id") is not None
            ]
            duplicates = sorted({shape_id for shape_id in shape_ids if shape_ids.count(shape_id) > 1})
            if duplicates:
                errors.append(f"Duplicate shape IDs in {slide_path}: {', '.join(duplicates)}")
            for element in root.iter():
                if local_name(element.tag) != "tcPr":
                    continue
                forbidden = [name for name in element.attrib if local_name(name) in {"marT", "marB", "anchor"}]
                if forbidden:
                    errors.append(f"Unsupported table-cell attributes in {slide_path}: {', '.join(forbidden)}")

        notes = sorted(name for name in names if name.startswith("ppt/notesSlides/") and name.endswith(".xml"))
        if notes:
            warnings.append(f"Package contains {len(notes)} notes slide part(s).")

        return {
            "ok": not errors,
            "path": str(Path(path).resolve()),
            "memberCount": len(names),
            "slideCount": len(slide_paths),
            "errors": errors,
            "warnings": warnings,
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pptx", help="Path to a .pptx file")
    args = parser.parse_args()
    result = validate(args.pptx)
    print(json.dumps(result, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
