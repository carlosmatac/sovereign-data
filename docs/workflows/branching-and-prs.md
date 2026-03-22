# Branching and pull requests

How we merge **feature branches** into **`main`**: rebase onto updated `main`, resolve conflicts locally, then open a clean PR.

---

## Merge to `main` workflow

When a feature is finished and ready to be merged into `main`, follow this process.

### 1. Commit and push all branch changes

Make sure all work on the feature branch is committed and pushed before starting the merge process.

```bash
git add .
git commit -m "your message"
git push origin your-branch-name
```

### 2. Update local `main`

Switch to `main` and bring the latest remote changes.

```bash
git fetch origin
git checkout main
git pull origin main
```

This is important because other changes may have been merged into `main` while you were developing your feature.

### 3. Go back to your working branch

```bash
git checkout your-branch-name
```

### 4. Rebase your branch onto updated `main`

```bash
git rebase main
```

This rewrites your branch on top of the latest `main`, so conflicts are solved **before** opening the PR.

### 5. Resolve conflicts carefully

If conflicts appear:

- Resolve them locally.
- Review the affected code carefully.
- Use an agent to help resolve the conflicts if needed.
- Do **not** blindly accept changes without understanding them.

This is usually the part where the developer needs to read the most code and verify behavior carefully.

After resolving conflicts:

```bash
git add .
git rebase --continue
```

Repeat until the rebase is complete.

### 6. Push the rebased branch

Because rebase rewrites commit history, you must force-push the branch.

Use:

```bash
git push --force-with-lease origin your-branch-name
```

**Important:**

- Do this **from the terminal**.
- Do **not** rely on the IDE sync button for this step — the IDE may not perform the required force push.
- `--force-with-lease` is required so the remote branch is updated **safely** after the rebase.

### 7. Open the pull request

This step should be done exclusively by developer in GitHub.
Once the rebased branch is pushed:

- Open a PR from your branch to `main`.
- In principle, there should be **no merge conflicts** left, because they were already resolved locally during the rebase.

The PR should now be clean and ready for review.

---

## Expected result

If the workflow is followed correctly:

- Your branch is based on the latest `main`.
- Conflicts were resolved before the PR.
- The PR is easier to review.
- Merge risk is reduced.
- `main` history stays cleaner.

---

## Notes

- Use this workflow **by default** for feature branches.
- If the task is very small and the developer chooses **not** to use a branch, that is an **explicit** workflow decision (see [`AGENTS.md`](../../AGENTS.md) for repo flexibility on branching).
- When in doubt, prefer **rebasing** and resolving conflicts **locally** before opening the PR.
