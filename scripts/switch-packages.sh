#!/bin/bash

# Script to switch package versions in example projects
# Usage: 
#   ./scripts/switch-packages.sh workspace           # Switch to workspace:* versions
#   ./scripts/switch-packages.sh pkg <commit_hash>   # Switch to pkg.pr.new versions

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Example directories
EXAMPLES=(
  "example/next-app"
  "example/nuxt-app"
  "example/react-vite-app"
  "example/tanstack-app"
  "example/vue-vite-app"
)

# Browser Echo packages to update
PACKAGES=(
  "@browser-echo/next"
  "@browser-echo/nuxt"
  "@browser-echo/react"
  "@browser-echo/vite"
  "@browser-echo/vue"
)

usage() {
  echo "Usage: $0 <mode> [commit_hash]"
  echo ""
  echo "Modes:"
  echo "  workspace           Switch to workspace:* versions"
  echo "  pkg <commit_hash>   Switch to pkg.pr.new versions with specified commit hash"
  echo ""
  echo "Examples:"
  echo "  $0 workspace"
  echo "  $0 pkg 880c16c"
  exit 1
}

switch_to_workspace() {
  echo "🔄 Switching all examples to workspace versions..."
  
  for example in "${EXAMPLES[@]}"; do
    package_json="$ROOT_DIR/$example/package.json"
    
    if [[ ! -f "$package_json" ]]; then
      echo "⚠️  Skipping $example (package.json not found)"
      continue
    fi
    
    echo "📦 Processing $example..."
    
    # Update each package to workspace version
    for pkg_name in "${PACKAGES[@]}"; do
      # Check if package exists in devDependencies
      if grep -q "\"$pkg_name\":" "$package_json"; then
        # Use sed to replace the version
        if [[ "$OSTYPE" == "darwin"* ]]; then
          # macOS sed
          sed -i '' "s|\"$pkg_name\": \"[^\"]*\"|\"$pkg_name\": \"workspace:*\"|g" "$package_json"
        else
          # Linux sed
          sed -i "s|\"$pkg_name\": \"[^\"]*\"|\"$pkg_name\": \"workspace:*\"|g" "$package_json"
        fi
        echo "  ✅ Updated $pkg_name to workspace:*"
      fi
    done
  done
  
  echo "✨ All examples switched to workspace versions!"
}

switch_to_pkg() {
  local commit_hash="$1"
  
  if [[ -z "$commit_hash" ]]; then
    echo "❌ Error: commit hash required for pkg mode"
    usage
  fi
  
  echo "🔄 Switching all examples to pkg.pr.new versions (commit: $commit_hash)..."
  
  for example in "${EXAMPLES[@]}"; do
    package_json="$ROOT_DIR/$example/package.json"
    
    if [[ ! -f "$package_json" ]]; then
      echo "⚠️  Skipping $example (package.json not found)"
      continue
    fi
    
    echo "📦 Processing $example..."
    
    # Update each package to pkg.pr.new version
    for pkg_name in "${PACKAGES[@]}"; do
      # Check if package exists in devDependencies
      if grep -q "\"$pkg_name\":" "$package_json"; then
        pkg_url="https://pkg.pr.new/instructa/browser-echo/$pkg_name@$commit_hash"
        
        # Use sed to replace the version
        if [[ "$OSTYPE" == "darwin"* ]]; then
          # macOS sed
          sed -i '' "s|\"$pkg_name\": \"[^\"]*\"|\"$pkg_name\": \"$pkg_url\"|g" "$package_json"
        else
          # Linux sed
          sed -i "s|\"$pkg_name\": \"[^\"]*\"|\"$pkg_name\": \"$pkg_url\"|g" "$package_json"
        fi
        echo "  ✅ Updated $pkg_name to $pkg_url"
      fi
    done
  done
  
  echo "✨ All examples switched to pkg.pr.new versions!"
}

main() {
  if [[ $# -eq 0 ]]; then
    usage
  fi
  
  local mode="$1"
  
  case "$mode" in
    "workspace")
      switch_to_workspace
      ;;
    "pkg")
      switch_to_pkg "$2"
      ;;
    *)
      echo "❌ Error: Unknown mode '$mode'"
      usage
      ;;
  esac
  
  echo ""
  echo "🔧 Don't forget to run 'pnpm install' in the example directories to apply changes!"
}

main "$@"
