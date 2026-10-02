# Code Block Word Wrapping

This document outlines the code block formatting and wrapping behavior in Preechak AI.

## Overview

In assistant and history views, code snippets and markdown code blocks are styled to ensure high readability on windows of all dimensions. Long code lines (such as detailed comments, long variable names, or chained calls) wrap within the container boundaries to eliminate horizontal scrolling while preserving indentation and vertical scrolling.

## Architecture and Styling

- **Component Styles**: [src/components/views/markdownStyles.js](file:///Users/phillip/projects/preechak-ai/src/components/views/markdownStyles.js) defines the styles for rendered code blocks (`.code-block-wrapper`, `.code-block-pre`, and `.code-block-pre code.hljs`).
- **Wrapping Configuration**:
    - `white-space: pre-wrap`: Preserves tabs, multiple spaces, and intentional line breaks while wrapping lines when the container edge is reached.
    - `word-break: break-word`: Breaks excessively long contiguous tokens across lines to prevent overflow.
    - `overflow-wrap: anywhere`: Breaks unbreakable sequences if needed to fit the window bounds.
    - `overflow-x: hidden`: Suppresses horizontal scrollbars.
    - `max-width: 100%`: Constrains the code block to the parent container width.
    - `background: var(--bg-elevated)`: Seamlessly adapts background opacity and color when window transparency is adjusted via shortcuts or preferences.
- **Copy Code Integration**: Copy button copies the original raw un-wrapped code string stored in `data-code`.

## Verification

Run the test suite to verify markdown rendering and styling declarations:

```bash
node --test tests/markdown-renderer.test.cjs
```
