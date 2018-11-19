# coc-highlight

Provide default highlight for [coc.nvim](https://github.com/neoclide/coc.nvim),
including document highlight (highlight of current document symbol) and colors
highlight.

<img width="536" alt="screen shot 2018-11-19 at 7 56 47 pm" src="https://user-images.githubusercontent.com/251450/48705891-75e27f80-ec35-11e8-91ac-ee684b937e8c.png">

## Install

In your vim/neovim, run command:

```
:CocInstall coc-highlight
```

## Features

- Highlight symbol of current position in all positions of current buffer (when no document
  highlight provider exists from language server).
- Highlight colors of current buffer (when no color provider exists from
  language server).

## Usage

To enable highlight on `CursorHold` with [coc.nvim](https://github.com/neoclide/coc.nvim), add:

```vim
autocmd CursorHold * silent call CocActionAsync('highlight')
```

to your `.vimrc`.

To disable coc provide color highlight, add:

```json
"coc.preferences.colorSupport": false,
```

to your `settings.json`.

## Options

- `highlight.disableLanguages`, list of filetypes to ignore for this extension.
- `highlight.document.enable`, set to `false` to disable document symbol
  highlight.
- `highlight.colors,enable`, set to `false` to disable color highlight.


## F.A.Q

Q: Why color highlight is not shown on my vim?

A: Make sure you have `set termguicolors` in your `.vimrc`, and your terminal
support true color.

## License

MIT
