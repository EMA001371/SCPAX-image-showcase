const STORAGE_KEYS = {
  favorites: "stillroom-favorites",
  compact: "stillroom-compact-grid"
};
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1wnisJN1C7DpdBEgzpXHIyBismjKNsm4ZU7_VAErdeIk/export?format=csv&gid=0";
const SCP_SIGNS_CSV_URL = "https://docs.google.com/spreadsheets/d/1wnisJN1C7DpdBEgzpXHIyBismjKNsm4ZU7_VAErdeIk/gviz/tq?tqx=out:csv&sheet=SCP-signs";
const SIZE_REFERENCE_CSV_URL = "https://docs.google.com/spreadsheets/d/1wnisJN1C7DpdBEgzpXHIyBismjKNsm4ZU7_VAErdeIk/gviz/tq?tqx=out:csv&sheet=size-reference";
const IMAGE_DIRECTORY = "./images/";

const state = {
  categories: [],
  images: [],
  latestImages: [],
  visibleImages: [],
  favorites: readStoredSet(STORAGE_KEYS.favorites),
  favoritesOnly: false,
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
    requestedBy: normalizedHeaders.indexOf("requestedby")
  };
  if (Object.values(columns).some((column) => column < 0)) {
    throw new Error("The spreadsheet needs name, sign#, id, category1, category2, and [requested] by columns.");
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
    if (state.favoritesOnly && !state.favorites.has(image.id)) return false;
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
  const totalImages = state.images.filter((image) =>
    !state.activeCategory || image.category === state.activeCategory
  ).length;
  const countElement = document.querySelector("[data-image-count]");
  if (countElement) countElement.textContent = `${totalImages} ${totalImages === 1 ? "image" : "images"}`;
  imageGrid.replaceChildren();
  renderImageCards(images, images).forEach((card) => imageGrid.append(card));
  if (emptyState) emptyState.hidden = images.length > 0;
  updateFilterNotice();
}

function pairedImagesFor(image) {
  const match = image.title.match(/^(.*)-(L|R)$/i);
  if (!match) return null;
  const pairedTitle = `${match[1]}-${match[2].toLocaleLowerCase() === "l" ? "R" : "L"}`;
  const pairedImage = state.images.find((candidate) =>
    candidate.title.toLocaleLowerCase() === pairedTitle.toLocaleLowerCase()
  );
  if (!pairedImage) return null;
  return [image, pairedImage].sort((left, right) => left.title.slice(-1).localeCompare(right.title.slice(-1)));
}

function alternateImageSource(image) {
  const alternateTitle = image.title.toLocaleLowerCase().startsWith("scp-")
    ? image.title.slice(4)
    : `SCP-${image.title}`;
  if (!alternateTitle || alternateTitle === image.title) return null;
  return `${IMAGE_DIRECTORY}${encodeURIComponent(alternateTitle)}.webp`;
}

function setImageSource(element, image) {
  element.onerror = () => {
    const fallback = alternateImageSource(image);
    if (fallback && element.dataset.fallbackAttempted !== "true") {
      element.dataset.fallbackAttempted = "true";
      element.src = fallback;
      return;
    }
    console.error(`Unable to load image file for "${image.title}".`);
  };
  element.src = image.src;
}

function renderImageCards(images, lightboxImages = images, isNewForImage = () => false) {
  const rendered = new Set();
  const cards = [];
  images.forEach((image, index) => {
    if (rendered.has(image.id)) return;
    const pairedImages = pairedImagesFor(image);
    if (pairedImages) pairedImages.forEach((pairedImage) => rendered.add(pairedImage.id));
    const displayImage = pairedImages?.find((part) => lightboxImages.includes(part)) || pairedImages?.[0] || image;
    const displayIndex = lightboxImages.indexOf(displayImage);
    cards.push(createImageCard(
      displayImage,
      displayIndex >= 0 ? displayIndex : index,
      lightboxImages,
      isNewForImage(image),
      pairedImages
    ));
  });
  return cards;
}

function createImageCard(image, index, lightboxImages = state.visibleImages, isNew = false, pairedImages = null) {
  const card = makeElement("article", "image-card");
  if (image.signCategory) card.dataset.signCategory = image.signCategory;
  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "image-open";
  const titleMatch = image.title.match(/^(.*)-(L|R)$/i);
  const displayTitle = pairedImages ? titleMatch?.[1] || image.title : image.title;
  openButton.setAttribute("aria-label", `View ${pairedImages ? `${displayTitle} L/R pair` : image.title}`);
  openButton.addEventListener("click", () => openLightbox(index, lightboxImages));

  const imageWrap = makeElement("span", "image-frame");
  if (pairedImages) imageWrap.classList.add("image-frame--paired");
  if (isNew) {
    imageWrap.append(makeElement("span", "new-image-badge", "NEW"));
  }
  const imagesToDisplay = pairedImages || [image];
  imagesToDisplay.forEach((part) => {
    const img = document.createElement("img");
    img.alt = pairedImages ? `${displayTitle} ${part.title.slice(-1)}` : part.alt;
    img.loading = "lazy";
    img.decoding = "async";
    img.width = part.width;
    img.height = part.height;
    setImageSource(img, part);
    if (pairedImages) {
      const panel = makeElement("span", "image-pair-panel");
      panel.append(img, makeElement("span", "image-pair-label", part.title.slice(-1).toLocaleUpperCase()));
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
  const detailsText = pairedImages
    ? `${category?.name || "Collection"} · L/R pair · IDs ${pairedImages.map((part) => part.reference).join(" / ")}`
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
  document.querySelectorAll("[data-favorites-toggle]").forEach((button) => {
    button.setAttribute("aria-pressed", String(state.favoritesOnly));
  });
}

function updateFilterNotice() {
  if (!filterNotice || !filterLabel) return;
  const labels = [];
  if (state.favoritesOnly) labels.push("Saved images");
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
  const pairedImages = pairedImagesFor(image);
  if (pairedImages && pairContainer) {
    lightboxImage.hidden = true;
    pairContainer.hidden = false;
    const titleMatch = image.title.match(/^(.*)-(L|R)$/i);
    const leftImage = lightbox.querySelector("[data-lightbox-left]");
    leftImage.alt = `${titleMatch?.[1] || image.title} L`;
    setImageSource(leftImage, pairedImages[0]);
    const rightImage = lightbox.querySelector("[data-lightbox-right]");
    rightImage.alt = `${titleMatch?.[1] || image.title} R`;
    setImageSource(rightImage, pairedImages[1]);
    lightbox.querySelector("[data-lightbox-title]").textContent = `${titleMatch?.[1] || image.title} (L/R)`;
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
  if (pairedImages) {
    const [leftPart, rightPart] = pairedImages;
    const leftDetails = new Map((leftPart.details || []).filter(([label]) => label !== "Name"));
    const rightDetails = new Map((rightPart.details || []).filter(([label]) => label !== "Name"));
    const labels = [...new Set([...leftDetails.keys(), ...rightDetails.keys()])];
    detailRows = labels.flatMap((label) => {
      const leftValue = leftDetails.get(label);
      const rightValue = rightDetails.get(label);
      if (label === "ID") {
        return [
          [`L ${label}`, leftValue],
          [`R ${label}`, rightValue]
        ].filter(([, value]) => value);
      }
      if (label === "Requested by" && leftValue && rightValue &&
        leftValue.trim().replace(/\s+/g, " ").toLocaleLowerCase() ===
        rightValue.trim().replace(/\s+/g, " ").toLocaleLowerCase()) {
        return [[label, leftValue]];
      }
      if (leftValue && leftValue === rightValue) return [[label, leftValue]];
      return [
        ...(leftValue ? [[`L ${label}`, leftValue]] : []),
        ...(rightValue ? [[`R ${label}`, rightValue]] : [])
      ];
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
  const pairedImages = pairedImagesFor(currentImage);
  if (pairedImages?.some((part) => part.id === state.visibleImages[nextIndex]?.id)) {
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

  document.querySelectorAll("[data-favorites-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      state.favoritesOnly = !state.favoritesOnly;
      updateFavoriteCounts();
      renderGallery();
      document.querySelector("#gallery")?.scrollIntoView({ behavior: "smooth" });
    });
  });
  document.querySelectorAll("[data-clear-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.favoritesOnly = false;
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
      const pairedImages = pairedImagesFor(image);
      return !pairedImages || image.title.toLocaleLowerCase().endsWith("-l");
    });
    for (let index = featuredSource.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [featuredSource[index], featuredSource[randomIndex]] = [featuredSource[randomIndex], featuredSource[index]];
    }
    state.highlightSlides = featuredSource;
  }
  const isVisible = (image) => !state.favoritesOnly || state.favorites.has(image.id);
  const featured = state.highlightSlides.filter(isVisible);
  state.visibleHighlightSlides = featured;
  const latestImages = state.latestImages.length ? state.latestImages : state.images;
  const sortedByDate = latestImages
    .filter(isVisible)
    .sort((left, right) => {
      const leftHasDate = Number.isFinite(left.fileDate);
      const rightHasDate = Number.isFinite(right.fileDate);
      if (leftHasDate && rightHasDate) return right.fileDate - left.fileDate;
      if (leftHasDate) return -1;
      if (rightHasDate) return 1;
      return latestImages.indexOf(right) - latestImages.indexOf(left);
    });
  const newestDate = sortedByDate.find((image) => Number.isFinite(image.fileDate))?.fileDate;
  const newestDateKey = Number.isFinite(newestDate)
    ? Math.floor(newestDate / 3_600_000)
    : null;
  const newestDateImages = newestDateKey
    ? sortedByDate.filter((image) =>
      Number.isFinite(image.fileDate) &&
      Math.floor(image.fileDate / 3_600_000) === newestDateKey
    )
    : [];
  const olderImages = sortedByDate.filter((image) => !newestDateImages.includes(image));
  const latest = newestDateKey
    ? [...newestDateImages, ...olderImages.slice(0, Math.max(0, 6 - newestDateImages.length))]
    : sortedByDate.slice(0, 6);

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
        const pairedImages = pairedImagesFor(featured[index]);
        const displayImage = pairedImages?.find((part) => featured.includes(part)) || featured[index];
        const displayIndex = featured.indexOf(displayImage);
        const card = createImageCard(displayImage, displayIndex >= 0 ? displayIndex : index, featured, false, pairedImages);
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
    latestGrid.replaceChildren(...renderImageCards(latest, latest, (image) => {
      if (!newestDateKey) return false;
      return (pairedImagesFor(image) || [image]).some((part) =>
        Number.isFinite(part.fileDate) &&
        Math.floor(part.fileDate / 3_600_000) === newestDateKey
      );
    }));
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

function parseEmbeddedDate(value) {
  const normalized = value.trim().replace(
    /^(\d{4}):(\d{2}):(\d{2})(?:\s+(\d{2}:\d{2}:\d{2}))?/,
    (_, year, month, day, time) => `${year}-${month}-${day}${time ? `T${time}` : ""}`
  );
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp)
    ? null
    : { timestamp, hasTime: /T\d{2}:\d{2}/i.test(normalized) };
}

function parseWebpDate(buffer) {
  const view = new DataView(buffer);
  const readAscii = (offset, length) =>
    new TextDecoder().decode(new Uint8Array(buffer, offset, length));
  if (buffer.byteLength < 12 || readAscii(0, 4) !== "RIFF" || readAscii(8, 4) !== "WEBP") return null;

  const readExifDate = (chunkOffset, chunkLength) => {
    let start = chunkOffset;
    if (chunkLength >= 6 && readAscii(start, 6) === "Exif\u0000\u0000") start += 6;
    if (start + 8 > chunkOffset + chunkLength) return null;
    const byteOrder = readAscii(start, 2);
    if (byteOrder !== "II" && byteOrder !== "MM") return null;
    const littleEndian = byteOrder === "II";
    const tiff = new DataView(buffer, start, chunkOffset + chunkLength - start);
    if (tiff.getUint16(2, littleEndian) !== 42) return null;

    const readIfd = (offset) => {
      if (offset + 2 > tiff.byteLength) return null;
      const count = tiff.getUint16(offset, littleEndian);
      if (offset + 2 + count * 12 + 4 > tiff.byteLength) return null;
      const entries = new Map();
      for (let index = 0; index < count; index += 1) {
        const entry = offset + 2 + index * 12;
        const tag = tiff.getUint16(entry, littleEndian);
        const type = tiff.getUint16(entry + 2, littleEndian);
        const valueCount = tiff.getUint32(entry + 4, littleEndian);
        const valueOffset = valueCount <= 4 ? entry + 8 : tiff.getUint32(entry + 8, littleEndian);
        if (type === 2 && valueOffset + valueCount <= tiff.byteLength) {
          entries.set(tag, readAscii(start + valueOffset, valueCount).replace(/\0+$/, ""));
        } else if (type === 4 && valueCount === 1) {
          entries.set(tag, tiff.getUint32(entry + 8, littleEndian));
        }
      }
      return entries;
    };

    const ifd0Offset = tiff.getUint32(4, littleEndian);
    const ifd0 = readIfd(ifd0Offset);
    if (!ifd0) return null;
    const exifIfdOffset = ifd0.get(0x8769);
    const exifIfd = typeof exifIfdOffset === "number" ? readIfd(exifIfdOffset) : null;
    for (const tag of [0x9003, 0x9004]) {
      const date = exifIfd?.get(tag);
      if (typeof date === "string") {
        const parsedDate = parseEmbeddedDate(date);
        if (parsedDate) return { rank: tag === 0x9003 ? 0 : 1, ...parsedDate };
      }
    }
    const dateTime = ifd0.get(0x0132);
    if (typeof dateTime === "string") {
      const parsedDate = parseEmbeddedDate(dateTime);
      if (parsedDate) return { rank: 4, ...parsedDate };
    }
    return null;
  };

  let bestDate = null;
  const riffEnd = Math.min(buffer.byteLength, view.getUint32(4, true) + 8);
  for (let offset = 12; offset + 8 <= riffEnd;) {
    const chunkName = readAscii(offset, 4);
    const chunkLength = view.getUint32(offset + 4, true);
    const chunkOffset = offset + 8;
    if (chunkOffset + chunkLength > riffEnd) break;
    if (chunkName === "EXIF") {
      const date = readExifDate(chunkOffset, chunkLength);
      if (date && (!bestDate || date.rank < bestDate.rank)) bestDate = date;
    } else if (chunkName === "XMP ") {
      const xmp = new TextDecoder().decode(new Uint8Array(buffer, chunkOffset, chunkLength));
      const dateTags = [
        ["DateTimeOriginal", 0],
        ["CreateDate", 1],
        ["DateCreated", 2],
        ["DateTimeDigitized", 3],
        ["DateTime", 4],
        ["Created", 5],
        ["ModifyDate", 6]
      ];
      for (const [tag, rank] of dateTags) {
        const match = xmp.match(new RegExp(`<[^>]*:?${tag}\\b[^>]*>([^<]+)<`, "i"));
        const parsedDate = match ? parseEmbeddedDate(match[1]) : null;
        if (parsedDate && (!bestDate || rank < bestDate.rank)) bestDate = { rank, ...parsedDate };
      }
    }
    offset = chunkOffset + chunkLength + (chunkLength % 2);
  }
  return bestDate ?? null;
}

async function loadImageFileDates(images = state.images) {
  const results = await Promise.allSettled(images.map(async (image) => {
    let response = await fetch(image.src);
    if (!response.ok) {
      const fallback = alternateImageSource(image);
      if (!fallback) throw new Error(`Image request failed for "${image.title}": ${response.status}`);
      response = await fetch(fallback);
      if (!response.ok) throw new Error(`Image request failed for "${image.title}": ${response.status}`);
      image.src = fallback;
    }
    const embeddedDate = parseWebpDate(await response.arrayBuffer());
    const lastModified = Date.parse(response.headers.get("Last-Modified") || "");
    if (embeddedDate?.hasTime) return embeddedDate.timestamp;
    if (Number.isFinite(lastModified)) return lastModified;
    return embeddedDate?.timestamp ?? null;
  }));
  let failedCount = 0;
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      images[index].fileDate = result.value;
    } else {
      failedCount += 1;
    }
  });
  if (failedCount) {
    console.warn(`Could not read embedded dates from ${failedCount} image file${failedCount === 1 ? "" : "s"}.`);
  }
  renderHomeGalleries();
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
    const [response, sizeResponse, latestResponse] = await Promise.all([
      fetch(isScpSignsPage ? SCP_SIGNS_CSV_URL : SHEET_CSV_URL),
      fetch(SIZE_REFERENCE_CSV_URL),
      page === "home" ? fetch(SCP_SIGNS_CSV_URL) : Promise.resolve(null)
    ]);
    if (!response.ok) throw new Error(`Spreadsheet request failed: ${response.status}`);
    if (!sizeResponse.ok) throw new Error(`Size reference request failed: ${sizeResponse.status}`);
    if (latestResponse && !latestResponse.ok) throw new Error(`SCP signs spreadsheet request failed: ${latestResponse.status}`);
    const sizeReference = parseSizeReference(await sizeResponse.text());
    const data = sheetGallery(await response.text(), sizeReference, isScpSignsPage);
    state.categories = data.categories;
    state.images = data.images;
    populateSignFilter(data.images);
    state.latestImages = page === "home"
      ? [...data.images, ...sheetGallery(await latestResponse.text(), sizeReference, true).images]
      : data.images;
    const heroImage = document.querySelector("[data-hero-image]");
    if (heroImage && state.images[0]) {
      heroImage.alt = state.images[0].alt;
      setImageSource(heroImage, state.images[0]);
      const heroTitle = document.querySelector("[data-hero-title]");
      if (heroTitle) heroTitle.textContent = state.images[0].title.toLocaleUpperCase();
    }
    renderCategories();
    if (page === "category") initializeCategoryPage();
    if (page === "home") {
      renderHomeGalleries();
      void loadImageFileDates(state.latestImages);
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
