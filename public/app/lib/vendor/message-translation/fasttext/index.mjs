// src/options.ts
var defaultOptions = {
  corePath: "./core/fasttext.mjs",
  wasmPath: void 0
};

// src/utils.ts
var readFile, request, fileURLToPath, vector2Array = (vector, deleteAferConvert = !1) => {
  let arr = [];
  for (let i = 0; i < vector.size(); i++)
    arr.push(vector.get(i));
  return deleteAferConvert && vector.delete(), arr;
}, kvPairVector2Map = (vector, deleteAferConvert = !1) => {
  let map = /* @__PURE__ */ new Map();
  for (let [key, value] of vector2Array(vector, deleteAferConvert))
    map.set(key, value);
  return map;
}, vkPairVector2Map = (vector, deleteAferConvert = !1) => {
  let map = /* @__PURE__ */ new Map();
  for (let [value, key] of vector2Array(vector, deleteAferConvert))
    map.set(key, value);
  return map;
}, buffer2Uin8Array = (buf) => new Uint8Array(buf.buffer, buf.byteOffset, buf.length), fetchFile = async (url) => typeof global < "u" && globalThis === global ? url.startsWith("file://") ? (readFile ?? (readFile = (await import("fs/promises")).readFile), fileURLToPath ?? (fileURLToPath = (await import("url")).fileURLToPath), buffer2Uin8Array(await readFile(fileURLToPath(url)))) : (request ?? (request = (await import("http")).request), new Promise((resolve, reject) => {
  let chunks = [];
  request(
    url,
    (res) => res.on("close", () => resolve(buffer2Uin8Array(Buffer.concat(chunks)))).on("data", (chunk) => chunks.push(chunk)).on("error", (err) => reject(err))
  );
})) : typeof Deno < "u" && url.startsWith("file://") ? Deno.readFile(url) : new Uint8Array(await (await fetch(url)).arrayBuffer());

// src/index.ts
var TEMP_MODEL_PATH = "/_tmp_model.ftz", FastText = class _FastText {
  /** Emscripten module */
  core;
  /** Emscripten filesystem */
  fs;
  ft;
  constructor(core) {
    this.core = core, this.fs = core.FS, this.ft = new core.FastText();
  }
  /**
   * Create a new FastText instance
   * @param [options] init options
   * @returns promise with a FastText instance
   */
  static async create(options = {}) {
    let opt = { ...defaultOptions, ...options }, coreCtor = (await import(opt.corePath)).default, core = await coreCtor({
      locateFile: (url, prefix) => opt.wasmPath && url.endsWith(".wasm") ? opt.wasmPath : `${prefix}${url}`,
      print: () => {
      },
      printErr: () => {
      }
    });
    return new _FastText(core);
  }
  loadModel(model = "./model/lid.176.ftz") {
    return typeof model == "string" ? fetchFile(new URL(model, import.meta.url).href).then(
      (data) => this._loadModel(data)
    ) : this._loadModel(model);
  }
  _loadModel(model) {
    this.fs.writeFile(TEMP_MODEL_PATH, model), this.ft.loadModel(TEMP_MODEL_PATH), this.fs.unlink(TEMP_MODEL_PATH);
  }
  /** Detect the most probable language
   * @param text text to detect
   * @returns two or three letter language code
   */
  detect(text) {
    return Array.from(this.predict(text, -1, 0)).sort((lang1, lang2) => lang2[1] - lang1[1])[0][0].slice(9);
  }
  /** Same as predict method of fastText, return a Map of probability
   *  @param text text to predict
   *  @param [k] max number of return entries, use -1 to return all
   *  @param [thresold] min possibility of return entries(0~1)
   *  @returns Map of __lable__$(lang) => probability
   */
  predict(text, k = -1, thresold = 0) {
    return vkPairVector2Map(this.ft.predict(text, k, thresold), !0);
  }
};
export {
  FastText,
  buffer2Uin8Array,
  fetchFile,
  kvPairVector2Map,
  vector2Array,
  vkPairVector2Map
};
