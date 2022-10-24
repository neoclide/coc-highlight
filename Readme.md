# coc-highlight

Provide filetype irrelevant highlights to [coc.nvim](https://github.com/neoclide/coc.nvim),
including document highlight (highlight of current document symbol) and color
highlights.

<img width="480" alt="Screen Shot 2019-07-01 at 9 11 33 AM" src="https://user-images.githubusercontent.com/251450/60405074-979ae080-9be0-11e9-8039-b9a48fd8b5ad.png">

**Important** the implementation from version 2.0.0 have changed from language
server to worker threads, and only changed lines are calculated for colors.

## Install

In your vim/neovim, run command:

```
:CocInstall coc-highlight
```

## Features

- Highlight the same word symbols of word under cursor.
- Add color highlights to buffers when enabled.

## Usage

To enable highlight current symbol on `CursorHold`, add:

```vim
autocmd CursorHold * silent call CocActionAsync('highlight')
```

to your `.vimrc` or use the [coc_current_word plugin](https://github.com/IngoMeyer441/coc_current_word) which provides
configurable delayed highlighting independently from the user's `updatetime` setting.

To add colors support for all filetypes, use:

```json
"colors.filetypes": ["*"],
```

to your `settings.json`.

To pick a different color, use command:

```
:call CocAction('pickColor')
```

**Note:** only works on Mac or have python gtk module installed.

To pick a different color presentation, use command:

```
:call CocAction('colorPresentation')
```

## Options

- `highlight.trace`: Trace level for colors highlight. default: `"messages"`
  Valid options: ["off","messages","verbose"]
- `highlight.disableLanguages`: List of filetypes to ignore. default: `[]`
- `highlight.document.enable`: Set to false disable document highlight of current symbol, reload coc.nvim required on change, default: `true`
- `highlight.colors.enable`: Set to false to disable color highlight, reload coc.nvim required on change, default: `true`
- `highlight.colorNames.enable`: Set to false to disable highlight of color names, default: `true`

## F.A.Q

**Q:** Why color highlight is not shown on my vim?

**A:** For terminal vim, you have to enable 24-bit RGB color by `set termguicolors` and make sure your terminal support true colors. To make sure the
highlight is not disabled, enable verbose output by `"highlight.trace": "verbose"` in configuration file and checkout the output by `:CocCommand workspace.showOutput highlight`.

**Q:** How to change highlight of the current symbol.

**A:** All you need is overwrite the highlight group, checkout `:h coc-highlights`

## License

MIT
