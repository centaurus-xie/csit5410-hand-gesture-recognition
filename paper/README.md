# CSIT5410 project paper

An editable ISBI-format report of the single-hand digit recognition study.
The results use the preserved expanded static experiment in
`artifacts/digits-0-9/`. The author fields in `main.tex` must be confirmed
before submission.

Project repository: https://github.com/centaurus-xie/csit5410-hand-gesture-recognition

## Files

- `main.tex`: compile this file; edit the title and three author names here.
- `sections/`: abstract, introduction, method, results, and conclusion.
- `references.bib`: references for the project paper.
- `figures/`: experiment figures; use PDF or PNG as appropriate.
- `spconf.sty`, `IEEEbib.bst`: unchanged formatting files from the supplied template.
- `upstream/`: unchanged course-provided LaTeX template and supporting files.
- `LICENSE`: upstream template license notice; this does not license the entire project.

## Build locally

Run these commands from the repository root with a TeX distribution and latexmk installed:

```bash
cd paper
mkdir -p .build
latexmk -pdf -interaction=nonstopmode -halt-on-error -outdir=.build main.tex
```

The output is `paper/.build/main.pdf`. On macOS, while inside `paper/`:

```bash
open .build/main.pdf
```

Always compile `main.tex`, even when editing an individual file under `sections/`.
latexmk runs BibTeX and subsequent LaTeX passes automatically.
For Overleaf, upload the contents of this folder and select `main.tex` with pdfLaTeX.

## Course requirements

- At most **5 pages including references**, as stated in the CSIT5410 announcement.
- Include Introduction, Method, Results, and Conclusion.
- Cite reused methods, datasets, and pretrained models.
- A link to the group's GitHub repository is recommended.
- Submit the paper and PowerPoint via Canvas by **25 November 2026, 23:59**.
- Presentation: **26 November 2026**, 15 minutes plus 3 minutes of Q&A.

## Team workflow

Edit assigned section files on your own branch. Commit the source files and
figures, then open a pull request into `main`. Compile the full paper before
merging. The `.gitignore` excludes build products and keeps source figures.

The experiment's original split lists and detailed metrics are saved alongside
the trained classifiers. The paper reports the frozen split used in that run.
The current training script can stratify future runs by variant when data permit.

## Template provenance

Course-provided source:
https://github.com/HenryVu27/ISBI2026/tree/main/ISBI_template-master/ISBI_template-master

Downloaded on 22 October 2026. The original `Template_ISBI_latex.tex` and its
supporting files remain under `upstream/`. `main.tex` is a separately named
adaptation that preserves the supplied document class and style, adds section
files and hyperlink support, and removes example guideline text and dummy images.
The upstream example bibliography is not the project's bibliography.
See `upstream/SHA256SUMS` for the downloaded file hashes.
