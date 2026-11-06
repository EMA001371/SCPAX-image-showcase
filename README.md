# EMA001371's Image Archive

A responsive, static image gallery that can be hosted on GitHub Pages. Image records are read from a publicly viewable Google Sheet, with image files stored in the repository; no build step or framework is required.

## Run locally

Because the gallery loads the spreadsheet CSV with `fetch`, open it through a local web server rather than directly as a `file://` URL. For example, with Python installed:

```sh
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Spreadsheet and image files

The gallery reads the CSV export of the linked Google Sheet directly. The sheet must be viewable by anyone with the link. The `signs` sheet supplies image names and collection metadata. The separate **SCP signs** page reads the `SCP-signs` sheet and joins its `sign#` values to the `sign#`, `width`, and `height` entries in `size-reference`.

Add image files to `images/` and add a corresponding row to the appropriate sheet; files without a sheet row are not included in the gallery. The filename should match the row's `name` value, with or without the `SCP-` prefix. The gallery tries `.webp`, `.png`, `.jpg`, and `.jpeg` files, in that order (for example, `images/SCP-maintenance-L1.webp` or `images/SCP-maintenance-L1.png`). On the **SCP signs** page, `SCP-` is added to names that do not already have it. `category1` groups the collections; `category2`, `sign#`, `id`, and `[requested] by` are shown with the image in the viewer. Keep the sheet public so the static site can fetch its CSV.

The home page shows a continuously auto-advancing highlights carousel that draws from a randomly shuffled deck of signs, with the current image centered between two smaller previews. The previous/next arrows follow that deck, so recently shown images can be revisited. Rotation continues while hovered or focused. Image cards display the full image without cropping. Matching `-L` and `-R` files are shown together; files named with `-top-L`, `-top-R`, `-bottom-L`, and `-bottom-R` are grouped as one four-part sign. Sign dimensions are displayed as `width × height px`, based on the `size-reference` sheet. The Latest additions section draws from both the `signs` and `SCP-signs` sheets and includes every image from the newest timestamp hour. Embedded WebP capture/creation timestamps are preferred; when embedded metadata has only a date, the file's last-modified time is used instead. Those images are marked **NEW**, and older images fill the section when needed. Images without a recognized date follow in spreadsheet order. The request total counts rows with a non-empty `[requested] by` value.

## Publish with GitHub Pages

Push these files to a GitHub repository. In **Settings → Pages**, choose **Deploy from a branch**, select the branch and `/ (root)` folder, then save. The site works from a project subpath because its local asset links are relative.

## Included features

- Separate collection pages and category navigation
- Search across titles, tags, descriptions, and collection names
- Prominent total and per-collection image counts
- Home-page highlights, latest spreadsheet additions, and sign/request totals
- Dedicated collections and SCP signs pages
- Dedicated SCP signs page with sign dimensions from the size-reference sheet
- Filter by sign number and sort by spreadsheet order, title, category, or sign number
- Category image counters
- Saved/favorites page with search and sorting (stored in the visitor's browser)
- Spacious/compact grid preference
- Image viewer with previous/next controls and keyboard arrows
- `/` keyboard shortcut to focus search, plus responsive and reduced-motion layouts
