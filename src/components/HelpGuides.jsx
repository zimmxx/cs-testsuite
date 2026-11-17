import userGuide from "../../docs/USER_GUIDE.md?raw";
import glossary from "../../docs/MEASUREMENT_GLOSSARY.md?raw";

export default function HelpGuides() {
  return <div>{[["User guide — Test team, Cleanroom team and PDK team", userGuide, "USER_GUIDE.md"], ["Measurement glossary — parameters, units and results", glossary, "MEASUREMENT_GLOSSARY.md"]].map(([title, content, file]) => <details className="help-guide" key={file}><summary>{title}</summary><pre>{content}</pre><a href={`https://github.com/zimmxx/cs-testsuite/blob/main/docs/${file}`} target="_blank" rel="noreferrer">View repository document</a></details>)}</div>;
}
