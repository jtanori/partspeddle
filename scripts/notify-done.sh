#!/bin/bash
# Terminal notification for task completion
# Usage: ./scripts/notify-done.sh ["message"]

MESSAGE="${1:-Task complete}"

# Play system sound
afplay /System/Library/Sounds/Glass.aiff &

# Show macOS notification
osascript -e "display notification \"$MESSAGE\" with title \"VINTRACK Agent\" sound name \"Glass\""
