#!/bin/bash

# Read the commit message from stdin
msg=$(cat)

# Remove Claude-specific lines
cleaned_msg=$(echo "$msg" | grep -v "🤖 Generated with \[Claude Code\]" | grep -v "Co-Authored-By: Claude")

# Remove empty lines at the end
cleaned_msg=$(echo "$cleaned_msg" | sed '/^$/N;/^\n$/d')

# Output the cleaned message
echo "$cleaned_msg"