#!/bin/sh

echo "Publishing to GitHub Pages..."

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "You have uncommitted changes. Commit them first."
    exit 1
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)

# Switch to gh-pages branch
git checkout gh-pages 2>/dev/null || git checkout --orphan gh-pages

# Get all files from master except the extraction tool

# 用当前分支作为发布源
git checkout "$CURRENT_BRANCH" -- .
# git checkout main -- .
git rm --cached extraction.html 2>/dev/null || true
rm -f extraction.html

# Add .nojekyll
touch .nojekyll

# Commit and push
git add .
git commit -m "Deploy $(date)"
git push origin gh-pages

# Back to original branch
git checkout "$CURRENT_BRANCH"

echo "Done!"
