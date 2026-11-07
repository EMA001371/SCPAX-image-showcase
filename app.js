const STORAGE_KEYS = {
  favorites: "stillroom-favorites",
  compact: "stillroom-compact-grid"
};
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1wnisJN1C7DpdBEgzpXHIyBismjKNsm4ZU7_VAErdeIk/export?format=csv&gid=0";
const SCP_SIGNS_CSV_URL = "https://docs.google.com/spreadsheets/d/1wnisJN1C7DpdBEgzpXHIyBismjKNsm4ZU7_VAErdeIk/gviz/tq?tqx=out:csv&sheet=SCP-signs";
const SIZE_REFERENCE_CSV_URL = "https://docs.google.com/spreadsheets/d/1wnisJN1C7DpdBEgzpXHIyBismjKNsm4ZU7_VAErdeIk/gviz/tq?tqx=out:csv&sheet=size-reference";
const IMAGE_DIRECTORY = "./images/";
const IMAGE_EXTENSIONS = [".webp", ".png", ".jpg", ".jpeg"];

const state = {
  categories: [],
  images: [],
  latestImages: [],
  visibleImages: [],
  favorites: readStoredSet(STORAGE_KEYS.favorites),
  activeCategory: null,
  lightboxIndex: -1,
  highlightSlides: [],
  visibleHighlightSlides: [],
  highlightIndex: 0,
  highlightDirection: 1,
  highlightTimer: null
};

const page = document.body.dataset.page;
const imageGrid = document.querySelector("[data-image-grid]");
const categoryList = document.querySelector("[data-category-list]");
const searchInput = document.querySelector("[data-search]");
const sortSelect = document.querySelector("[data-sort]");
const signFilter = document.querySelector("[data-sign-filter]");
const emptyState = document.querySelector("[data-empty-state]");
const filterNotice = document.querySelector("[data-active-filter]");
const filterLabel = document.querySelector("[data-active-filter-label]");
const lightbox = document.querySelector("[data-lightbox]");

function readStoredSet(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(stored) ? stored.filter((item) => typeof item === "string") : []);
  } catch (error) {
    console.error(`Unable to read ${key} from local storage.`, error);
    return new Set();
  }
}

function saveSet(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch (error) {
    console.error(`Unable to save ${key} to local storage.`, error);
  }
}

function text(value) {
  return document.createTextNode(value);
}

function makeElement(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field.trim());
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function sheetGallery(csv, sizeReference = new Map(), isScpSigns = false) {
  const [headers, ...rows] = parseCsv(csv);
  if (!headers) throw new Error("The spreadsheet CSV is empty.");
  const normalizedHeaders = headers.map((header) => header.toLocaleLowerCase().replace(/[^a-z0-9]/g, ""));
  const columns = {
    name: normalizedHeaders.indexOf("name"),
    sign: normalizedHeaders.indexOf("sign"),
    id: normalizedHeaders.indexOf("id"),
    category1: normalizedHeaders.indexOf("category1"),
    category2: normalizedHeaders.indexOf("category2"),
    requestedBy: normalizedHeaders.indexOf("requestedby"),
    isNew: normalizedHeaders.indexOf("new")
  };
  if (Object.values(columns).some((column) => column < 0)) {
    throw new Error("The spreadsheet needs name, sign#, id, category1, category2, [requested] by, and new columns.");
  }
  const categories = [];
  const categoryIds = new Map();
  const images = [];

  const getCategoryId = (name) => {
    if (!categoryIds.has(name)) {
      const id = `sheet-${categoryIds.size + 1}`;
      categoryIds.set(name, id);
      categories.push({ id, name, label: "SPREADSHEET / COLLECTION", description: "" });
    }
    return categoryIds.get(name);
  };
  const addImage = (row) => {
    const name = row[columns.name] || "";
    const id = row[columns.id] || "";
    if (!name || !id) return;
    const categoryName = row[columns.category1] || "Uncategorized";
    const category2 = row[columns.category2] || "";
    const requestedBy = row[columns.requestedBy] || "";
    const isNew = row[columns.isNew]?.toLocaleLowerCase() === "true";
    const signNumbers = (row[columns.sign] || "").split(",").map((sign) => sign.trim()).filter(Boolean);
    const sizeSignNumber = signNumbers[0];
    const hasCategory2 = category2 && category2.toLocaleLowerCase() !== "none";
    const sizes = sizeSignNumber ? sizeReference.get(sizeSignNumber) || "" : "";
    const category = getCategoryId(categoryName);
    const title = isScpSigns && !name.toLocaleLowerCase().startsWith("scp-") ? `SCP-${name}` : name;
    const imagePath = `${IMAGE_DIRECTORY}${encodeURIComponent(title)}.webp`;
    images.push({
      id: `sheet-${id}`,
      title,
      category,
      src: imagePath,
      alt: title,
      width: 1200,
      height: 900,
      signNumbers,
      isNew,
      tags: [id, categoryName, hasCategory2 ? category2 : "", requestedBy].filter(Boolean),
      reference: id,
      signNumber: sizeSignNumber && Number.isFinite(Number(sizeSignNumber))
        ? Number(sizeSignNumber)
        : null,
      requestedBy,
      signCategory: isScpSigns ? categoryName.toLocaleLowerCase() : "",
      details: [
        ["Name", title],
        ["Sign#", signNumbers.join(", ")],
        ["Size", sizes],
        ["ID", id],
        ["Category 1", categoryName],
        ...(hasCategory2 ? [["Category 2", category2]] : []),
        ["Requested by", requestedBy]
      ].filter(([, value]) => value)
    });
  };

  rows.forEach(addImage);

  if (!images.length) {
    throw new Error("No image rows were found. Each spreadsheet row needs a name and ID.");
  }
  return { categories, images };
}

function namespaceGallery(data, prefix) {
  const categoryIds = new Map(data.categories.map((category) => [category.id, `${prefix}-${category.id}`]));
  return {
    categories: data.categories.map((category) => ({ ...category, id: categoryIds.get(category.id) })),
    images: data.images.map((image) => ({ ...image, category: categoryIds.get(image.category) }))
  };
}

function parseSizeReference(csv) {
  const [headers, ...rows] = parseCsv(csv);
  if (!headers) throw new Error("The size-reference spreadsheet is empty.");
  const normalizedHeaders = headers.map((header) => header.toLocaleLowerCase().replace(/[^a-z0-9]/g, ""));
  const signColumn = normalizedHeaders.indexOf("sign");
  const widthColumn = normalizedHeaders.indexOf("width");
  const heightColumn = normalizedHeaders.indexOf("height");
  if ([signColumn, widthColumn, heightColumn].some((column) => column < 0)) {
    throw new Error("The size-reference sheet needs sign#, width, and height columns.");
  }

  return new Map(rows
    .filter((row) => row[signColumn] && row[widthColumn] && row[heightColumn])
    .map((row) => [row[signColumn], `${row[widthColumn]} × ${row[heightColumn]} px`]));
}

function categoryHref(categoryId) {
  return `./category.html?category=${encodeURIComponent(categoryId)}`;
}

function renderCategories() {
  if (!categoryList) return;
  categoryList.replaceChildren();

  state.categories.forEach((category, index) => {
    const link = document.createElement("a");
    link.className = "collection-card";
    link.href = categoryHref(category.id);
    link.setAttribute("aria-label", `Browse ${category.name}`);

    const imageWrap = makeElement("span", "collection-image");
    const image = document.createElement("img");
    image.alt = "";
    image.loading = "lazy";
    imageWrap.append(image);

    const number = makeElement("span", "collection-number", category.label || `0${index + 1} / COLLECTION`);
    const info = makeElement("span", "collection-info");
    const title = makeElement("span", "collection-title", category.name);
    const categoryImages = state.images.filter((imageEntry) => imageEntry.category === category.id);
    const count = categoryImages.length;
    if (categoryImages[0]) setImageSource(image, categoryImages[0]);
    const imageCount = makeElement("span", "collection-count", `${count} ${count === 1 ? "IMAGE" : "IMAGES"}`);
    imageCount.setAttribute("aria-label", `${count} ${count === 1 ? "image" : "images"}`);
    info.append(title, imageCount);
    const arrow = makeElement("span", "collection-arrow", "↗");
    arrow.setAttribute("aria-hidden", "true");
    link.append(imageWrap, number, info, arrow);
    categoryList.append(link);
  });
}

function renderGallery() {
  if (page === "home") {
    renderHomeGalleries();
    return;
  }
  if (!imageGrid) return;
  const term = (searchInput?.value || "").trim().toLocaleLowerCase();
  const selectedSignNumber = signFilter?.value || "";
  let images = state.images.filter((image) => {
    if (state.activeCategory && image.category !== state.activeCategory) return false;
    if (page === "saved" && !state.favorites.has(image.id)) return false;
    if (selectedSignNumber && !image.signNumbers.includes(selectedSignNumber)) return false;
    if (!term) return true;
    const category = state.categories.find((entry) => entry.id === image.category);
    return [image.title, image.alt, ...(image.tags || []), category?.name || ""]
      .join(" ")
      .toLocaleLowerCase()
      .includes(term);
  });

  const categoryNames = new Map(state.categories.map((category) => [category.id, category.name]));
  const compareByTitle = (a, b) => a.title.localeCompare(b.title);
  if (sortSelect?.value === "title") {
    images.sort(compareByTitle);
  } else if (sortSelect?.value === "category") {
    images.sort((a, b) =>
      (categoryNames.get(a.category) || "").localeCompare(categoryNames.get(b.category) || "") ||
      compareByTitle(a, b)
    );
  } else if (sortSelect?.value === "sign-number") {
    images.sort((a, b) => {
      if (a.signNumber === null) return b.signNumber === null ? compareByTitle(a, b) : 1;
      if (b.signNumber === null) return -1;
      return a.signNumber - b.signNumber || compareByTitle(a, b);
    });
  }

  state.visibleImages = images;
  const totalImages = page === "saved"
    ? state.images.filter((image) => state.favorites.has(image.id)).length
    : state.images.filter((image) =>
      !state.activeCategory || image.category === state.activeCategory
    ).length;
  const countElement = document.querySelector("[data-image-count]");
  if (countElement) countElement.textContent = `${totalImages} ${totalImages === 1 ? "image" : "images"}`;
  imageGrid.replaceChildren();
  renderImageCards(images, images).forEach((card) => imageGrid.append(card));
  if (emptyState) emptyState.hidden = images.length > 0;
  if (emptyState && page === "saved" && images.length === 0) {
    emptyState.textContent = totalImages
      ? "No saved images match your search. Try another term."
      : "You haven't saved any images yet. Select the star on an image to save it here.";
  }
  updateFilterNotice();
}

function groupedImagesFor(image) {
  const quadrant = image.title.match(/^(.*)-(top|bottom)-(L|R)$/i);
  if (quadrant) {
    const [, baseTitle] = quadrant;
    const parts = state.images.filter((candidate) => {
      const match = candidate.title.match(/^(.*)-(top|bottom)-(L|R)$/i);
      return match && match[1].toLocaleLowerCase() === baseTitle.toLocaleLowerCase();
    });
    if (parts.length > 1) {
      const order = new Map([["top-l", 0], ["top-r", 1], ["bottom-l", 2], ["bottom-r", 3]]);
      return parts.sort((left, right) => {
        const leftMatch = left.title.match(/-(top|bottom)-(L|R)$/i);
        const rightMatch = right.title.match(/-(top|bottom)-(L|R)$/i);
        return order.get(`${leftMatch[1].toLocaleLowerCase()}-${leftMatch[2].toLocaleLowerCase()}`) -
          order.get(`${rightMatch[1].toLocaleLowerCase()}-${rightMatch[2].toLocaleLowerCase()}`);
      });
    }
  }
  const match = image.title.match(/^(.*)-(L|R)$/i);
  if (!match) return null;
  const pairedTitle = `${match[1]}-${match[2].toLocaleLowerCase() === "l" ? "R" : "L"}`;
  const pairedImage = state.images.find((candidate) =>
    candidate.title.toLocaleLowerCase() === pairedTitle.toLocaleLowerCase()
  );
  if (!pairedImage) return null;
  return [image, pairedImage].sort((left, right) => left.title.slice(-1).localeCompare(right.title.slice(-1)));
}

function groupedImageTitle(image, groupedImages) {
  if (!groupedImages) return image.title;
  return image.title.replace(/-(?:(?:top|bottom)-)?(?:L|R)$/i, "");
}

function groupPartLabel(image) {
  const quadrant = image.title.match(/-(top|bottom)-(L|R)$/i);
  return quadrant ? `${quadrant[1].toLocaleUpperCase()} ${quadrant[2].toLocaleUpperCase()}` :
    image.title.slice(-1).toLocaleUpperCase();
}

function imageSourceCandidates(image) {
  const alternateTitle = image.title.toLocaleLowerCase().startsWith("scp-")
    ? image.title.slice(4)
    : `SCP-${image.title}`;
  const titles = [image.title];
  if (alternateTitle && alternateTitle !== image.title) titles.push(alternateTitle);
  return titles.flatMap((title) =>
    IMAGE_EXTENSIONS.map((extension) => `${IMAGE_DIRECTORY}${encodeURIComponent(title)}${extension}`)
  );
}

function setImageSource(element, image) {
  const sources = imageSourceCandidates(image);
  let sourceIndex = 0;
  element.onerror = () => {
    sourceIndex += 1;
    if (sourceIndex < sources.length) {
      element.src = sources[sourceIndex];
      return;
    }
    console.error(`Unable to load image file for "${image.title}".`);
  };
  element.src = sources[0];
}

function renderImageCards(images, lightboxImages = images, isNewForImage = (image) => image.isNew) {
  const rendered = new Set();
  const cards = [];
  images.forEach((image, index) => {
    if (rendered.has(image.id)) return;
    const groupedImages = groupedImagesFor(image);
    if (groupedImages) groupedImages.forEach((part) => rendered.add(part.id));
    const displayImage = groupedImages?.find((part) => lightboxImages.includes(part)) || groupedImages?.[0] || image;
    const displayIndex = lightboxImages.indexOf(displayImage);
    cards.push(createImageCard(
      displayImage,
      displayIndex >= 0 ? displayIndex : index,
      lightboxImages,
      (groupedImages || [image]).some(isNewForImage),
      groupedImages
    ));
  });
  return cards;
}

function createImageCard(image, index, lightboxImages = state.visibleImages, isNew = false, groupedImages = null) {
  const card = makeElement("article", "image-card");
  if (image.signCategory) card.dataset.signCategory = image.signCategory;
  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "image-open";
  const displayTitle = groupedImageTitle(image, groupedImages);
  const groupDescription = groupedImages?.length === 4 ? "four-part image" : "L/R pair";
  openButton.setAttribute("aria-label", `View ${groupedImages ? `${displayTitle} ${groupDescription}` : image.title}`);
  openButton.addEventListener("click", () => openLightbox(index, lightboxImages));

  const imageWrap = makeElement("span", "image-frame");
  if (groupedImages) {
    imageWrap.classList.add("image-frame--paired");
    if (groupedImages.length === 4) imageWrap.classList.add("image-frame--quartered");
  }
  if (isNew) {
    imageWrap.append(makeElement("span", "new-image-badge", "NEW"));
  }
  const imagesToDisplay = groupedImages || [image];
  imagesToDisplay.forEach((part) => {
    const img = document.createElement("img");
    img.alt = groupedImages ? `${displayTitle} ${groupPartLabel(part)}` : part.alt;
    img.loading = "lazy";
    img.decoding = "async";
    img.width = part.width;
    img.height = part.height;
    setImageSource(img, part);
    if (groupedImages) {
      const panel = makeElement("span", "image-pair-panel");
      panel.append(img, makeElement("span", "image-pair-label", groupPartLabel(part)));
      imageWrap.append(panel);
    } else {
      imageWrap.append(img);
    }
  });
  const overlay = makeElement("span", "image-overlay", "View image ↗");
  overlay.setAttribute("aria-hidden", "true");
  openButton.append(imageWrap, overlay);

  const details = makeElement("div", "image-details");
  const title = makeElement("h3", "image-title", displayTitle);
  const category = state.categories.find((entry) => entry.id === image.category);
  const detailsText = groupedImages
    ? `${category?.name || "Collection"} · ${groupDescription} · IDs ${groupedImages.map((part) => part.reference).join(" / ")}`
    : image.requestedBy
    ? `${category?.name || "Collection"} · ID ${image.reference} · requested by ${image.requestedBy}`
    : `${category?.name || "Collection"} · ID ${image.reference}`;
  const meta = makeElement("p", "image-meta", detailsText);
  details.append(title, meta);

  const actions = makeElement("div", "image-actions");
  const favorite = document.createElement("button");
  favorite.type = "button";
  favorite.className = "favorite-button";
  const isFavorite = state.favorites.has(image.id);
  favorite.setAttribute("aria-pressed", String(isFavorite));
  favorite.setAttribute("aria-label", isFavorite ? `Remove ${image.title} from saved images` : `Save ${image.title}`);
  favorite.title = isFavorite ? "Remove from saved" : "Save image";
  favorite.append(makeElement("span", "", isFavorite ? "★" : "☆"));
  favorite.addEventListener("click", () => toggleFavorite(image.id));

  const copyId = document.createElement("button");
  copyId.type = "button";
  copyId.className = "copy-id-button";
  copyId.setAttribute("aria-label", `Copy ID for ${image.title}`);
  copyId.title = "Copy ID";
  const copyIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  copyIcon.setAttribute("viewBox", "0 0 24 24");
  copyIcon.setAttribute("aria-hidden", "true");
  const backPage = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  backPage.setAttribute("x", "8");
  backPage.setAttribute("y", "3");
  backPage.setAttribute("width", "12");
  backPage.setAttribute("height", "14");
  backPage.setAttribute("rx", "1.5");
  const frontPage = document.createElementNS("http://www.w3.org/2000/svg", "path");
  frontPage.setAttribute("d", "M16 7H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7Z");
  copyIcon.append(backPage, frontPage);
  copyId.append(copyIcon);
  copyId.addEventListener("click", () => copyImageId(image, copyId));
  actions.append(favorite, copyId);

  card.append(openButton, details, actions);
  return card;
}

function toggleFavorite(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  saveSet(STORAGE_KEYS.favorites, state.favorites);
  updateFavoriteCounts();
  renderGallery();
}

function updateFavoriteCounts() {
  document.querySelectorAll("[data-favorites-count]").forEach((count) => {
    count.textContent = String(state.favorites.size);
  });
}

function updateFilterNotice() {
  if (!filterNotice || !filterLabel) return;
  const labels = [];
  if (signFilter?.value) labels.push(`Sign #: ${signFilter.value}`);
  if (searchInput?.value.trim()) labels.push(`Search: “${searchInput.value.trim()}”`);
  filterNotice.hidden = labels.length === 0;
  filterLabel.textContent = labels.join(" · ");
}

async function copyImageId(image, button) {
  try {
    await navigator.clipboard.writeText(image.reference);
    button.setAttribute("aria-label", `ID copied for ${image.title}`);
    button.classList.add("is-copied");
    window.setTimeout(() => {
      button.classList.remove("is-copied");
      button.setAttribute("aria-label", `Copy ID for ${image.title}`);
    }, 1400);
  } catch (error) {
    console.error("Unable to copy the image ID.", error);
    window.prompt("Copy this image ID:", image.reference);
  }
}

function openLightbox(index, images = state.visibleImages) {
  if (!lightbox || !images.length) return;
  state.visibleImages = images;
  state.lightboxIndex = index;
  updateLightbox();
  if (!lightbox.open) lightbox.showModal();
}

function openImageFromHash() {
  const imageId = window.location.hash.match(/^#image-(.+)$/)?.[1];
  if (!imageId) return;
  const index = state.visibleImages.findIndex((image) => image.id === imageId);
  if (index >= 0) openLightbox(index);
}

function updateLightbox() {
  const image = state.visibleImages[state.lightboxIndex];
  if (!image) return;
  const lightboxImage = lightbox.querySelector("[data-lightbox-image]");
  const pairContainer = lightbox.querySelector("[data-lightbox-pair]");
  const groupedImages = groupedImagesFor(image);
  if (groupedImages && pairContainer) {
    lightboxImage.hidden = true;
    pairContainer.hidden = false;
    pairContainer.replaceChildren();
    pairContainer.dataset.partCount = String(groupedImages.length);
    groupedImages.forEach((part) => {
      const panel = makeElement("div", "lightbox-part");
      const partImage = document.createElement("img");
      partImage.alt = `${groupedImageTitle(image, groupedImages)} ${groupPartLabel(part)}`;
      setImageSource(partImage, part);
      panel.append(partImage, makeElement("span", "image-pair-label", groupPartLabel(part)));
      pairContainer.append(panel);
    });
    const groupDescription = groupedImages.length === 4 ? "4-part" : "L/R";
    lightbox.querySelector("[data-lightbox-title]").textContent =
      `${groupedImageTitle(image, groupedImages)} (${groupDescription})`;
  } else {
    lightboxImage.hidden = false;
    lightboxImage.alt = image.alt;
    setImageSource(lightboxImage, image);
    if (pairContainer) pairContainer.hidden = true;
    lightbox.querySelector("[data-lightbox-title]").textContent = image.title;
  }
  const details = lightbox.querySelector("[data-lightbox-details]");
  details.replaceChildren();
  let detailRows = image.details || [];
  if (groupedImages) {
    const partDetails = groupedImages.map((part) => ({
      part,
      details: new Map((part.details || []).filter(([label]) => label !== "Name"))
    }));
    const labels = [...new Set(partDetails.flatMap(({ details: partMap }) => [...partMap.keys()]))];
    detailRows = labels.flatMap((label) => {
      const values = partDetails.map(({ part, details: partMap }) => ({
        part,
        value: partMap.get(label)
      })).filter(({ value }) => value);
      if (!values.length) return [];
      const commonValue = values[0].value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
      if (values.every(({ value }) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase() === commonValue)) {
        return [[label, values[0].value]];
      }
      return values.map(({ part, value }) => [`${groupPartLabel(part)} ${label}`, value]);
    });
  }
  detailRows.forEach(([label, value]) => {
    const term = makeElement("dt", "", label);
    const description = makeElement("dd", "", value);
    details.append(term, description);
  });
}

function moveLightbox(direction) {
  if (!state.visibleImages.length) return;
  const currentImage = state.visibleImages[state.lightboxIndex];
  let nextIndex = (state.lightboxIndex + direction + state.visibleImages.length) % state.visibleImages.length;
  const groupedImages = groupedImagesFor(currentImage);
  for (let attempts = 0; groupedImages?.some((part) => part.id === state.visibleImages[nextIndex]?.id) &&
    attempts < state.visibleImages.length; attempts += 1) {
    nextIndex = (nextIndex + direction + state.visibleImages.length) % state.visibleImages.length;
  }
  state.lightboxIndex = nextIndex;
  updateLightbox();
}

function initializeCategoryPage() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("source") === "scp-signs") {
    state.activeCategory = null;
    document.title = "SCP signs — EMA001371's";
    document.querySelector("[data-category-eyebrow]").textContent = "THE SCP SIGN ARCHIVE";
    document.querySelector("[data-category-title]").replaceChildren(text("SCP signs"), makeElement("span", "brand-period", "."));
    document.querySelector("[data-category-description]").textContent =
      "Browse every in-game SCP sign and a few additions requested by the community";
    document.querySelector("[data-breadcrumb]").textContent = "SCP signs";
    document.querySelector("[data-collections-nav]")?.classList.remove("is-active");
    document.querySelector("[data-collections-nav]")?.removeAttribute("aria-current");
    document.querySelector("[data-signs-nav]")?.classList.add("is-active");
    document.querySelector("[data-signs-nav]")?.setAttribute("aria-current", "page");
    const backLink = document.querySelector("[data-collections-link]");
    if (backLink) backLink.href = "./collections.html";
    return;
  }

  const categoryId = params.get("category");
  const category = state.categories.find((entry) => entry.id === categoryId);
  if (!category) {
    document.querySelector("[data-not-found]").hidden = false;
    document.querySelector(".category-intro").hidden = true;
    document.querySelector(".category-gallery").hidden = true;
    document.title = "Collection not found — EMA001371's";
    return;
  }
  state.activeCategory = category.id;
  document.title = `${category.name} — EMA001371's`;
  document.querySelector("[data-category-eyebrow]").textContent = category.label || "THE COLLECTION";
  document.querySelector("[data-category-title]").replaceChildren(text(category.name), makeElement("span", "brand-period", "."));
  document.querySelector("[data-category-description]").textContent = category.description || "";
  document.querySelector("[data-breadcrumb]").textContent = category.name;
  const backLink = document.querySelector("[data-collections-link]");
  if (backLink) backLink.href = "./collections.html";
  document.querySelector("[data-collections-nav]")?.classList.add("is-active");
  document.querySelector("[data-collections-nav]")?.setAttribute("aria-current", "page");
}

function initializeControls() {
  searchInput?.addEventListener("input", renderGallery);
  sortSelect?.addEventListener("change", renderGallery);
  signFilter?.addEventListener("change", renderGallery);
  document.querySelector("[data-highlight-prev]")?.addEventListener("click", () => moveHighlight(-1));
  document.querySelector("[data-highlight-next]")?.addEventListener("click", () => moveHighlight(1));

  document.querySelectorAll("[data-clear-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (signFilter) signFilter.value = "";
      updateFavoriteCounts();
      renderGallery();
    });
  });
  document.querySelectorAll("[data-grid-toggle]").forEach((button) => {
    const compact = localStorage.getItem(STORAGE_KEYS.compact) === "true";
    document.body.classList.toggle("compact-grid", compact);
    button.setAttribute("aria-pressed", String(compact));
    button.setAttribute("aria-label", compact ? "Use spacious image grid" : "Use compact image grid");
    button.addEventListener("click", () => {
      const nowCompact = document.body.classList.toggle("compact-grid");
      localStorage.setItem(STORAGE_KEYS.compact, String(nowCompact));
      button.setAttribute("aria-pressed", String(nowCompact));
      button.setAttribute("aria-label", nowCompact ? "Use spacious image grid" : "Use compact image grid");
    });
  });

  document.querySelector("[data-lightbox-close]")?.addEventListener("click", () => lightbox.close());
  document.querySelector("[data-lightbox-prev]")?.addEventListener("click", () => moveLightbox(-1));
  document.querySelector("[data-lightbox-next]")?.addEventListener("click", () => moveLightbox(1));
  lightbox?.addEventListener("click", (event) => {
    if (event.target === lightbox) lightbox.close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      searchInput?.focus();
    }
    if (lightbox?.open) {
      if (event.key === "ArrowLeft") moveLightbox(-1);
      if (event.key === "ArrowRight") moveLightbox(1);
    }
  });
  updateFavoriteCounts();
}

function populateSignFilter(images) {
  if (!signFilter) return;
  const signNumbers = [...new Set(images.flatMap((image) => image.signNumbers))]
    .sort((left, right) => Number(left) - Number(right) || left.localeCompare(right));
  signFilter.replaceChildren(new Option("All", ""));
  signNumbers.forEach((signNumber) => {
    signFilter.add(new Option(signNumber, signNumber));
  });
  signFilter.closest("label").hidden = signNumbers.length === 0;
}

function renderHomeGalleries() {
  const highlightGrid = document.querySelector('[data-image-grid="highlights"]');
  const latestGrid = document.querySelector('[data-image-grid="latest"]');
  if (!state.highlightSlides.length) {
    const featuredSource = state.images.filter((image) => {
      const groupedImages = groupedImagesFor(image);
      return !groupedImages || groupedImages[0].id === image.id;
    });
    for (let index = featuredSource.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [featuredSource[index], featuredSource[randomIndex]] = [featuredSource[randomIndex], featuredSource[index]];
    }
    state.highlightSlides = featuredSource;
  }
  const featured = state.highlightSlides;
  state.visibleHighlightSlides = featured;
  const latestImages = state.latestImages.length ? state.latestImages : state.images;
  const latest = latestImages.filter((image) => image.isNew);

  if (highlightGrid) {
    highlightGrid.dataset.carouselDirection = String(state.highlightDirection);
    if (featured.length) {
      state.highlightIndex %= featured.length;
      const positions = [
        { offset: -1, slot: "previous" },
        { offset: 0, slot: "current" },
        { offset: 1, slot: "next" }
      ];
      highlightGrid.replaceChildren(...positions.map(({ offset, slot }) => {
        const index = (state.highlightIndex + offset + featured.length) % featured.length;
        const groupedImages = groupedImagesFor(featured[index]);
        const displayImage = groupedImages?.find((part) => featured.includes(part)) || featured[index];
        const displayIndex = featured.indexOf(displayImage);
        const isNew = (groupedImages || [displayImage]).some((part) => part.isNew);
        const card = createImageCard(displayImage, displayIndex >= 0 ? displayIndex : index, featured, isNew, groupedImages);
        card.dataset.carouselSlot = slot;
        return card;
      }));
      const previous = document.querySelector("[data-highlight-prev]");
      const next = document.querySelector("[data-highlight-next]");
      if (previous) previous.disabled = featured.length < 2;
      if (next) next.disabled = featured.length < 2;
    } else {
      highlightGrid.replaceChildren(makeElement("p", "empty-state", "No images are available for the highlights."));
      const previous = document.querySelector("[data-highlight-prev]");
      const next = document.querySelector("[data-highlight-next]");
      if (previous) previous.disabled = true;
      if (next) next.disabled = true;
    }
  }
  if (latestGrid) {
    latestGrid.replaceChildren(...(latest.length
      ? renderImageCards(latest, latest)
      : [makeElement("p", "empty-state", "No images are marked NEW in the spreadsheet.")]));
  }

  const signCount = document.querySelector("[data-sign-total]");
  const requestCount = document.querySelector("[data-request-total]");
  if (signCount) signCount.textContent = String(latestImages.length);
  if (requestCount) requestCount.textContent = String(latestImages.filter((image) => image.requestedBy).length);

  window.clearInterval(state.highlightTimer);
  if (featured.length > 1) {
    state.highlightTimer = window.setInterval(() => {
      moveHighlight(1);
    }, 5000);
  }
}

function moveHighlight(direction) {
  const slideCount = state.visibleHighlightSlides.length;
  if (slideCount < 2) return;
  state.highlightDirection = Math.sign(direction);
  state.highlightIndex = (state.highlightIndex + direction + slideCount) % slideCount;
  renderHomeGalleries();
}

async function initialize() {
  initializeControls();
  try {
    const isScpSignsPage = page === "category" &&
      new URLSearchParams(window.location.search).get("source") === "scp-signs";
    const includeScpSigns = page === "home" || page === "saved";
    const [response, sizeResponse, latestResponse] = await Promise.all([
      fetch(isScpSignsPage ? SCP_SIGNS_CSV_URL : SHEET_CSV_URL),
      fetch(SIZE_REFERENCE_CSV_URL),
      includeScpSigns ? fetch(SCP_SIGNS_CSV_URL) : Promise.resolve(null)
    ]);
    if (!response.ok) throw new Error(`Spreadsheet request failed: ${response.status}`);
    if (!sizeResponse.ok) throw new Error(`Size reference request failed: ${sizeResponse.status}`);
    if (latestResponse && !latestResponse.ok) throw new Error(`SCP signs spreadsheet request failed: ${latestResponse.status}`);
    const sizeReference = parseSizeReference(await sizeResponse.text());
    const data = sheetGallery(await response.text(), sizeReference, isScpSignsPage);
    const scpData = latestResponse
      ? namespaceGallery(sheetGallery(await latestResponse.text(), sizeReference, true), "scp")
      : null;
    state.categories = [...data.categories, ...(scpData?.categories || [])];
    state.images = page === "saved"
      ? [...data.images, ...(scpData?.images || [])]
      : data.images;
    populateSignFilter(state.images);
    state.latestImages = page === "home"
      ? [...data.images, ...(scpData?.images || [])]
      : state.images;
    updateFavoriteCounts();
    const heroImage = document.querySelector("[data-hero-image]");
    if (heroImage && state.images[0]) {
      heroImage.alt = state.images[0].alt;
      setImageSource(heroImage, state.images[0]);
      const heroTitle = document.querySelector("[data-hero-title]");
      if (heroTitle) heroTitle.textContent = state.images[0].title.toLocaleUpperCase();
    }
    renderCategories();
    if (page === "category") initializeCategoryPage();
    if (page === "saved") {
      document.title = "Saved images — EMA001371's";
      document.querySelector("[data-saved-nav]")?.classList.add("is-active");
      document.querySelector("[data-saved-nav]")?.setAttribute("aria-current", "page");
    }
    if (page === "home") {
      renderHomeGalleries();
    }
    else renderGallery();
    openImageFromHash();
  } catch (error) {
    console.error("Unable to load the image gallery.", error);
    const message = error.message || "Check that the spreadsheet is publicly viewable and refresh.";
    if (imageGrid) imageGrid.replaceChildren(makeElement("p", "error-state", `The collection couldn't load. ${message}`));
    if (categoryList) categoryList.replaceChildren(makeElement("p", "error-state", `The collections couldn't load. ${message}`));
  }
}

initialize();
