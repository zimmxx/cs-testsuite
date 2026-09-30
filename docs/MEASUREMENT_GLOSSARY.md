# Measurement glossary

## Dataset identity and process context

Project / MPW: the fabrication run or development project grouping related measurements. MPW means multi-project wafer.

Platform: the material and layer technology, such as SOI220nmPassive. SOI means silicon on insulator; SiN means silicon nitride. The thickness and active/passive designation distinguish fabrication technologies.

Slot: the wafer identifier within the project's recording scheme. A slot is not a die coordinate.

Step: the recorded process-stage identifier. Step description supplies its human meaning, such as Before cleaning. Confirm that meaning with the process owner; a number alone does not describe what happened.

BB / building block: the device under test, such as a waveguide, MMI splitter, crossing or grating coupler. Compare equivalent structures.

RIB / STRIP: waveguide cross-sections. A rib has a remaining slab beside its raised guiding region; a strip is etched through the guiding layer around the core. They can have different loss and process sensitivity.

TE / TM: optical polarization mode labels. Optical mode also includes the measurement wavelength; results from different modes should not be combined without a reason.

Die / chip: an individual measured location on the wafer. Coordinates locate it in the wafermap.

## Optical and electrical results

Insertion loss (dB): reduction in transmitted optical power relative to a reference when a device is inserted. More loss means less light reaches the output. In this app, verify launch/reference power and route configuration; coupling and other components may contribute to the measured total.

Propagation loss (dB/cm): loss of light per centimetre of travel along a waveguide. A cutback fit compares waveguides of different lengths to estimate this rate; it separates length-dependent loss from a common offset.

dB: a logarithmic power ratio. A positive loss of about 3 dB leaves half the reference power; 10 dB leaves one tenth. dBm expresses absolute optical power relative to 1 mW (0 dBm = 1 mW). Loss in dB and power in dBm are different quantities.

Coupling loss: power lost entering or leaving the chip. A grating-coupler result may include both input and output couplers depending on the measurement method; check the route convention before interpreting a per-coupler number.

Wavelength (nm): the optical wavelength at which a result is measured. Spectral window selects a range around the target wavelength. Spectral step controls sampling spacing within that range.

3 dB bandwidth (nm): wavelength span over which response stays within 3 dB of its reference peak response. Check the plot/reference used for a device with several peaks.

Heater efficiency (mW/pi): electrical power required for a pi-radian optical phase shift. Lower values mean less power for that phase change under the measured conditions.

MZI: Mach–Zehnder interferometer. Two optical paths interfere when recombined; heaters change their relative phase.

MMI: multimode interference device, commonly used to split or combine optical power.

## Processing quality and fabrication measurements

MSE / mean squared error: average squared residual between fit predictions and measured values. The app uses an MSE threshold to screen propagation fits. Smaller values mean closer agreement with that model; they do not prove a fabrication process meets its specifications.

Pass / Fail: in the Workspace and Overview, a die passes when its propagation fit meets the current MSE threshold and returns a loss value. The Chip Summary Table retains Pass/Fail for these individual MSE outcomes. The dataset-level fit quality is labelled Meets fit criteria or Needs fit review. Unusable fits need review. This is post-processing fit quality, not formal wafer acceptance. A high propagation loss can still have a good fit.

Fit yield (%): accepted fitted dies divided by reviewed dies, multiplied by 100. Exclusions change the denominator. This is different from overall device functionality yield or production wafer yield.

Not evaluated: no usable saved fit review. Excluded: a measured die deliberately left out of the reviewed aggregate. Record reasons in test-team comments.

Measurement acceptance: a manual acceptance decision, separate from the automatic processing result. Accepted is green, Rejected is red, Accepted with conditions is amber, and Awaiting review is grey. Accepted with conditions means the test team accepts the dataset with recorded caveats or follow-up work. Explain these in Test-team comments. Missing acceptance metadata is treated as Awaiting review, even when processing fits pass.

CD-SEM: critical-dimension scanning electron microscopy, used to measure fabricated dimensions. Design width is the intended width; measured width and deviation from design are different values. A tolerance is an allowed deviation chosen for that review. Dose describes the exposure setting and needs the process-specific units.

## Learn more

Optical terminology: ISO 11807-1, Integrated optics — Optical waveguide basic terms and symbols:
https://www.iso.org/obp/ui/#iso:std:iso:11807:-1:ed-2:v1:en

Propagation and insertion loss methods: Dell'Olio et al., Numerical and Experimental Methods for Estimating the Propagation Loss in Microphotonic Waveguides:
https://www.photonics.intec.ugent.be/download/pub_5408.pdf


Propagation fit quality uses Meets fit criteria (green), Needs fit review (amber), and Not evaluated (grey). These labels describe the automatic MSE fit assessment of included dies. Chip Summary Table and die tiles retain Pass/Fail for individual fit outcomes. Measurement acceptance is a separate manual decision that also covers transmission and future heater/electrical measurements.
