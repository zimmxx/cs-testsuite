# Propagation ANOVA

Open **Workspace > Propagation ANOVA** to compare chip-level propagation loss across independent groups, such as separate wafers. A group is one dataset or a user-defined condition. The response is propagation loss in dB/cm; each observation is one chip estimate. This is a one-factor, independent-groups analysis.

## Prepare and select groups

1. Review the propagation fit, wavelength, physical lengths, MSE threshold and exclusions in each dataset. Save the reviewed Dataset Snapshot if needed.
2. In Propagation ANOVA, find a saved local/GitHub dataset and choose **Add dataset as group**, or use **Add current accepted chips** for the live workspace. Imports are copies of the values at that moment; later changes in the optical workspace do not silently change an existing ANOVA group. Remove and re-add it after changing processing.
3. Give groups distinct labels, inspect their source/wafer identity and expand **Inspect group chip values and processing provenance**. Use Include to select groups or Remove to discard a group from this comparison.
4. Inspect the individual chip points, box plots, n, mean, sample SD and 95% Student's t mean CI. Group CIs are descriptive, unadjusted intervals; their overlap is not an ANOVA or pairwise decision rule.
5. Select the method and significance level, record the experimental design in study notes, and confirm independence before running.

Dataset imports retain their own target wavelength, spectral window/step, MSE threshold, physical lengths and waveguide exclusions. Only included chips with finite estimates passing that dataset's propagation MSE criteria enter the group. This is a fit-selection rule, not a manual fabrication acceptance verdict. Check that measurement conditions are comparable. Raw data and saved datasets are unchanged.

You may paste or import grouped CSV:

```csv
group,chip_id,loss_db_per_cm,wafer_id
Wafer A,Chip1,2.3,A
Wafer A,Chip2,2.6,A
Wafer B,Chip1,3.1,B
Wafer B,Chip2,3.4,B
```

The first three headers are required; optional `wafer_id` must be consistent within each group. Use the same wafer identifier when groups share that wafer. CSV values are user-selected estimates: no raw-trace processing or MSE filtering is applied. Chip IDs must be unique within each group. Repeated chip numbers on different wafers are allowed. The clearly labelled synthetic example demonstrates controls without using real measurements.

## Methods and results

The null hypothesis is that all included group population means are equal. At least two groups and two observations per group are required; at most 20 groups may be compared.

- **Welch ANOVA (default):** uses weights n/sample variance, a correction to F and adjusted denominator degrees of freedom. It allows unequal group variances. Every group must have strictly positive sample variance.
- **Classical one-way ANOVA:** assumes equal population variances. F is the between-group mean square divided by the within-group mean square. Results include the SS/df/MS table, η² = SSbetween/SStotal, and ω² = (SSbetween − dfbetween × MSwithin)/(SStotal + MSwithin), with negative ω² estimates displayed as zero. These effect-size estimates are reported for the classical model only.
- **Variance diagnostic:** median-centred Levene, often called the Brown–Forsythe variance test. This compares absolute deviations from each group median using classical ANOVA. It tests variance homogeneity, not normality, and does not automatically choose the ANOVA method. Degenerate absolute deviations may make this diagnostic unavailable.
- **Pairwise comparisons:** two-sided Welch t-tests for Welch ANOVA, or pooled t-tests using the common ANOVA residual mean square/df for the classical method. Holm adjustment covers all included group pairs. The table displays signed mean differences (A minus B), t, df, raw p and adjusted p. These are not Tukey HSD or Games–Howell tests. Pairwise results are exploratory unless the comparison family was specified in advance.

The decision uses p < the selected α (0.01, 0.05 or 0.10). A small p suggests at least one group mean differs under the assumptions; it does not establish a process cause or practical importance. A large p does not prove equality or equivalence. Classical results with zero pooled within-group variance and Welch groups with zero variance are blocked with an explanation rather than reporting a misleading p-value.

## Independence and interpretation

Do not enter multiple wavelengths, waveguides or repeated sweeps from the same chip as independent chips. Before/after measurements of the same wafer/chips need a paired or repeated-measures model. Multiple devices nested within wafers and spatially correlated chip values may require hierarchical/spatial analysis. Those models, factorial/two-way ANOVA and formal normality diagnostics are not implemented here.

The tool blocks duplicate source datasets and known overlapping chip/wafer identities across groups. Dataset wafer identity is derived from project/MPW and slot/wafer metadata; CSV identity uses the supplied `wafer_id`. Missing, inconsistent or differently formatted metadata can prevent detection, especially across input routes. The independence checkbox records the user's design review; it cannot establish independence from the values alone.

Both methods require appropriate distribution assumptions and outlier review, particularly with small groups. Filtering on MSE can introduce selection bias. Results describe the selected passing chips, not automatically all fabricated or rejected devices. If the experimental treatment was applied to whole wafers, chips from one wafer are not independent experimental replications of that wafer treatment; multiple wafers and an appropriate hierarchical design are needed for process-level inference.

## Save and export

**Export ANOVA report CSV** includes group statistics, every selected chip value, method, α, source/settings/exclusions, independence acknowledgement, study notes, omnibus/variance/pairwise results and caveats. It is separate from the wafer-statistics CSV.

**Export ANOVA project JSON** preserves all groups (including disabled groups), source context, settings, notes and the current result for portability. **Import ANOVA project JSON** restores inputs and requires independence confirmation and a fresh calculation; imported results are not trusted as a new calculation. Groups remain in the current tab session only. Export JSON before refreshing or closing the page. This feature does not autosave, publish measurements, or add ANOVA fields to existing dataset metadata.

## Calculation validation and references

Regression tests check classical F/p against the published SciPy mussel-shell example, Welch F/df against an independent rational-weight calculation, F probabilities against analytic distribution identities, variance diagnostics, Holm correction, shift/unit invariance, invalid/degenerate inputs, repeated-chip blocking, CSV/project round trips and saved dataset selection rules. The probability implementation uses a regularized incomplete beta continued fraction evaluated in the upper tail. No external statistics service receives the data.

- [NIST: one-way ANOVA](https://www.itl.nist.gov/div898/handbook/ppc/section2/ppc231.htm)
- [NIST: assumptions](https://www.itl.nist.gov/div898/handbook/prc/section4/prc422.htm)
- [SciPy: classical and Welch one-way ANOVA, including reference example](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.f_oneway.html)
- [NIST: Levene and median-centred variance test](https://www.itl.nist.gov/div898/handbook/eda/section3/eda35a.htm)
- [Statsmodels: Holm multiple-testing correction](https://www.statsmodels.org/stable/generated/statsmodels.stats.multitest.multipletests.html)
