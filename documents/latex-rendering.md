# LaTeX Math & Symbol Rendering

Preechak AI automatically converts inline and block LaTeX mathematical notation into clean, human-readable Unicode symbols, subscript/superscript markup, and styled mathematical containers.

## Overview

Large language models frequently output technical formulas, estimations, and metrics wrapped in LaTeX syntax (e.g., `$\approx 1.37\text{ bytes}$`, `$\sim 5{,}000\text{ QPS}$`, `$P_{95} < 200\text{ms}$`, `$\rightarrow$`). Rather than showing raw backslash commands, the markdown rendering engine parses and renders them directly.

## Capabilities

1. **Inline Math (`$ ... $`) & Block Math (`$$ ... $$`)**:
    - Math expressions outside code blocks are parsed and styled with `.math-inline` and `.math-block`.
2. **Mathematical & Arrow Symbols**:
    - Approximations: `\approx` $\rightarrow$ `≈`, `\sim` $\rightarrow$ `~`, `\cong` $\rightarrow$ `≅`, `\equiv` $\rightarrow$ `≡`
    - Arrows: `\rightarrow` / `\to` $\rightarrow$ `→`, `\leftarrow` $\rightarrow$ `←`, `\Rightarrow` $\rightarrow$ `⇒`, `\Leftrightarrow` $\rightarrow$ `⇔`
    - Arithmetic: `\times` $\rightarrow$ `×`, `\div` $\rightarrow$ `÷`, `\pm` $\rightarrow$ `±`, `\cdot` $\rightarrow$ `·`, `\infty` $\rightarrow$ `∞`, `\sqrt{x}` $\rightarrow$ `√(x)`
    - Relations: `\le` / `\leq` $\rightarrow$ `≤`, `\ge` / `\geq` $\rightarrow$ `≥`, `\ne` / `\neq` $\rightarrow$ `≠`
    - Greek Letters: `\mu` $\rightarrow$ `µ`, `\alpha` $\rightarrow$ `α`, `\beta` $\rightarrow$ `β`, `\theta` $\rightarrow$ `θ`, `\pi` $\rightarrow$ `π`, `\Delta` $\rightarrow$ `Δ`, `\Sigma` $\rightarrow$ `Σ`, `\Omega` $\rightarrow$ `Ω`
3. **Typography & Scripting**:
    - `\text{...}` text wrappers are stripped cleanly.
    - Thousands grouping `{,}` (e.g. `5{,}000`) renders as `5,000`.
    - Subscripts `P_{95}` render as `P<sub>95</sub>`.
    - Superscripts `10^{6}` render as `10<sup>6</sup>`.
4. **Code Block Protection**:
    - Fenced code blocks (`...`) and inline code (`...`) are isolated before math processing so literal code remains unaltered.

## Verification

Run test suite:

```bash
node --test tests/markdown-renderer.test.cjs
```
