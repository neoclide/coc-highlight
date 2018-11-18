# coc-highlight

Provide default highlight for [coc.nvim](https://github.com/neoclide/coc.nvim),
including document highlight (highlight of current document symbol) and colors
highlight.

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

## License

MIT
