#!/bin/bash
# Setup GitHub branch protection rulesets for Restbro repos.
#
# Prerequisites:
#   - gh CLI installed and authenticated (`gh auth login`)
#   - You must be the repo owner
#
# Usage:
#   chmod +x scripts/setup-branch-protection.sh
#   ./scripts/setup-branch-protection.sh
#
# This creates rulesets (not classic branch protection) which support
# bypass actors — allowing the owner to push/merge directly while
# requiring 2 approvals for everyone else.

set -euo pipefail

OWNER="shivam96anand"
REPOS=("restbro-app" "restbro-web")
USER_ID=104426844

for REPO in "${REPOS[@]}"; do
  echo "=== Setting up rulesets for $OWNER/$REPO ==="

  # Create main branch protection ruleset
  gh api \
    --method POST \
    "repos/$OWNER/$REPO/rulesets" \
    --input - <<EOF
{
  "name": "Main Branch Protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/main"],
      "exclude": []
    }
  },
  "bypass_actors": [
    {
      "actor_id": 5,
      "actor_type": "RepositoryRole",
      "bypass_mode": "always"
    }
  ],
  "rules": [
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 2,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": true,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          {
            "context": "Build & Test"
          }
        ]
      }
    },
    {
      "type": "non_fast_forward"
    },
    {
      "type": "deletion"
    }
  ]
}
EOF

  echo "✅ Ruleset created for $OWNER/$REPO"
  echo ""
done

echo "🎉 Done! Rulesets applied to all repos."
echo ""
echo "What this enforces:"
echo "  - PRs required to merge into main (except for you)"
echo "  - 2 approvals required on PRs (you can bypass this)"
echo "  - Stale reviews dismissed when new commits are pushed"
echo "  - Code owner review required (you are the code owner)"
echo "  - CI status checks must pass"
echo "  - No force-pushes or branch deletion on main"
echo ""
echo "You can verify at:"
echo "  https://github.com/$OWNER/restbro-app/settings/rules"
echo "  https://github.com/$OWNER/restbro-web/settings/rules"
