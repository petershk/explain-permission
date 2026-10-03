# explain-permission

A Claude Code mod. When Claude stops to ask "is this ok?" before running something, a pane opens beside the
conversation and explains the request in plain English:

- **WHAT** (cyan): what it will actually do on your computer or online
- **WHY** (magenta): why it's needed for what you asked, based on the conversation
- **RISK** (green / yellow / red): low, medium or high, and anything that gets sent, deleted, published or paid for

The dialog appears right away; the explanation fills in a few seconds later. Read the pane before you answer.

## Use it

```sh
claude --plugin-dir /path/to/explain-permission
```

Type `/explain-permission` to open the pane yourself. It docks on the right in fullscreen mode, and otherwise sits
above the prompt. It opens by itself on terminals at least 144 columns wide.

## Good to know

- Needs a recent Claude Code with mods (function hooks), an early-access feature.
- Each explanation is one extra model call on your own account. It asks Claude, with the conversation so far, and
  falls back to Haiku without the conversation if that fails.
- It only explains. It never approves or denies anything for you.

Made by Hermann Peterscheck · https://hermann.fyi

## Install from GitHub

This folder is also a plugin marketplace. Once it's in a GitHub repo:

```sh
claude plugin marketplace add petershk/explain-permission
claude plugin install explain-permission@hermann-mods
```

or the same with `/plugin` inside Claude Code. Needs Claude Code 2.1.287 or later.
