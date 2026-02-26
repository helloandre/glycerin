# Troubleshooting Guide

## Build Errors About google-chat-api

If you see TypeScript errors related to `google-chat-api` when running `npm run build`, this is because the package is installed directly from GitHub and needs to be built after installation.

### Solution

1. **Make sure you have Git installed and configured:**

   ```bash
   git --version
   ```

2. **Clean install all dependencies:**

   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

   The `postinstall` script should automatically build `google-chat-api`.

3. **If the build didn't happen automatically, manually build it:**

   ```bash
   npm run build:deps
   ```

4. **Verify google-chat-api was built:**

   ```bash
   ls -la node_modules/google-chat-api/packages/gchat/dist/core/
   ```

   You should see `.js`, `.d.ts` files (compiled JavaScript and TypeScript declarations).

5. **If the above doesn't work, try installing with legacy peer deps:**

   ```bash
   npm install --legacy-peer-deps
   npm run build:deps
   ```

6. **Clean install all dependencies:**

   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

7. **Verify google-chat-api was installed:**

   ```bash
   ls -la node_modules/google-chat-api/packages/gchat/dist/core/
   ```

   You should see `.d.ts` files (TypeScript declarations).

8. **If the above doesn't work, try installing with legacy peer deps:**
   ```bash
   npm install --legacy-peer-deps
   ```

### Common Issues

**Issue:** `Cannot find module 'google-chat-api/packages/gchat/dist/core/auth.js'`

**Solution:** The package wasn't installed from GitHub. Make sure:

- You have network access
- GitHub is accessible
- Run `npm install` again

**Issue:** TypeScript errors about missing types

**Solution:**

```bash
# Make sure TypeScript can find the declarations
npm run build -- --skipLibCheck
```

Or update `tsconfig.json` to skip library checks (already done in this project).

## macOS Password Popup

If you see a password popup when running the app, it's because the old authentication method tried to access your macOS Keychain to decrypt browser cookies.

**Solution:** This has been fixed in the latest version. Make sure you have the latest code and the popup won't appear anymore. The new version uses Playwright for authentication instead.

## Playwright Browser Not Installed

If you see an error about missing Playwright browsers:

```
Executable doesn't exist at /Users/.../ms-playwright/chromium...
```

**Solution:** This should install automatically on first run. If it doesn't:

```bash
npx playwright install chromium
```

## Other Issues

If you encounter other issues:

1. Check Node.js version: `node --version` (should be v18 or higher)
2. Check npm version: `npm --version`
3. Try clearing the cache: `npm cache clean --force`
4. Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
