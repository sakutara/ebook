/** Languages offered in the story request form. Vietnamese is left out: the app is Vietnamese. */
export const REQUEST_LANGUAGES = [
  'Trung',
  'Anh',
  'Nhật',
  'Hàn',
  'Pháp',
  'Đức',
  'Nga',
  'Tây Ban Nha',
  'Thái',
] as const

/** Shown last; picked when the source language is not in the list above. */
export const OTHER_LANGUAGE = 'Ngôn ngữ khác'

export const REQUEST_LANGUAGE_OPTIONS: readonly string[] = [...REQUEST_LANGUAGES, OTHER_LANGUAGE]
