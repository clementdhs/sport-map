// GET /api/profile/me/export: the text files of the archive, and the photos the browser downloads (signed
// URLs, valid an hour) to add to it. The archive is zipped in the browser, as photos would exceed the size
// of a server response.
export type AccountExport = {
  username: string
  files: { path: string, content: string }[]
  photos: { path: string, url: string }[]
}
