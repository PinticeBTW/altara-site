// Explicit website manual downloads. This does not select the stable updater feed.
export const ALTARA_MANUAL_RELEASE = {
  "id": 383373982,
  "tag": "v0.1.127",
  "htmlUrl": "https://github.com/PinticeBTW/altara-updates/releases/tag/v0.1.127",
  "apiUrl": "https://api.github.com/repos/PinticeBTW/altara-updates/releases/383373982",
  "tagApiUrl": "https://api.github.com/repos/PinticeBTW/altara-updates/releases/tags/v0.1.127"
} as const;

export const ALTARA_MANUAL_ASSETS: Readonly<Record<string, { size: number; digest: string }>> = {
  "Altara-0.1.127-amd64.deb": {
    "size": 103787944,
    "digest": "sha256:2e6972f5652ed8b350f0f2b368b26db4b9b37d2d589fe0b82dbefd5fd12a6f4a"
  },
  "Altara-0.1.127-x86_64.AppImage": {
    "size": 123239733,
    "digest": "sha256:2806f523115480dafb5357342b90de309091fc0698f94df9b3c254a834ff9927"
  },
  "Altara.0.1.127.tar.gz": {
    "size": 124814817,
    "digest": "sha256:7ffc616632c1c5d0fa36e4f98f0bbbae9a1d024d544c985a331773d24c6220c0"
  },
  "Altara.Setup.0.1.127.exe": {
    "size": 110804581,
    "digest": "sha256:29adeb4fd24563b2541ceb14b278b2a431792992c5e0dd8f5e6d5c3d189b0cf5"
  },
  "README-LINUX-0.1.127.txt": {
    "size": 1384,
    "digest": "sha256:8c8653dab2ff6ea1c751e40ae15e5c590530915aa3200464500d69726f485fb6"
  },
  "SHA256SUMS-linux-0.1.127.txt": {
    "size": 367,
    "digest": "sha256:df0460ff96ea544cec943c54f26727535afe29a76a7c0473e5bce643bd1dba4f"
  }
};
