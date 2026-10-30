// M2M100's published source/target vocabulary. Kept separate from inference so
// rendering the manual language chooser never loads a model or worker.
export const LOCAL_TRANSLATION_SOURCE_LANGUAGES = Object.freeze('af am ar ast az ba be bg bn br bs ca ceb cs cy da de el en es et fa ff fi fr fy ga gd gl gu ha he hi hr ht hu hy id ig ilo is it ja jv ka kk km kn ko lb lg ln lo lt lv mg mk ml mn mr ms my ne nl no ns oc or pa pl ps pt ro ru sd si sk sl so sq sr ss su sv sw ta th tl tn tr uk ur uz vi wo xh yi yo zh zu'.split(' '));
const supported = new Set(LOCAL_TRANSLATION_SOURCE_LANGUAGES);
export function isLocalTranslationSourceLanguage(value) { return supported.has(value); }
