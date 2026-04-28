Drop your default signup avatars in this folder.

Option A (recommended, no code changes):
- Add files named 1.png, 2.png, 3.png, ... (sequential)
- The app auto-detects these and picks one randomly at signup.

Option B (custom file names):
- Create manifest.json in this folder.
- Example:
  {
    "avatars": ["robot-blue.png", "robot-red.png", "./special/avatar-neon.png"]
  }
- Entries can be:
  - file names relative to this folder
  - relative paths (./...)
  - full URLs (https://...)

Notes:
- If no default avatars are found, signup still works (without auto avatar).
- Users can always change their avatar later in profile settings.
