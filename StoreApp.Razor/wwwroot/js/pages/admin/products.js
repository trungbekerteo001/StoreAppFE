window.StoreApp = window.StoreApp || {};                // object toàn cục
window.StoreApp.pages = window.StoreApp.pages || {};    // object con để chứa logic riêng của từng page

    // IIFE - toàn bộ hàm và biến của page chỉ dùng trong phạm vi này để tránh xung đột tên
StoreApp.pages.adminProducts = (() => {
    const dom = StoreApp.dom;               // chứa các phương thức thao tác DOM
    const http = StoreApp.http;             // chứa phương thức request để gọi API
    const role = StoreApp.role;             // chứa phương thức guard và decode role/token
    const msg = StoreApp.message;           // chứa phương thức show để hiển thị thông báo
    const pager = StoreApp.pager;           // chứa helper đọc metadata phân trang

    const API = {                       // chứa endpoint API dùng trong page này
        product: "/api/Product",
        category: "/api/Category",
        supplier: "/api/Supplier",
        uploadImage: "/api/Product/upload-image"
    };

    const state = {                     // state để lưu trạng thái hiện tại của page
        mode: "create",      // create | edit
        editId: null,        // id product đang sửa
        imageUrl: "",        // url ảnh hiện tại trong modal

        items: [],           // danh sách product của trang hiện tại
        categories: [],      // cache categories
        suppliers: [],       // cache suppliers

        pageNumber: 1,
        pageSize: 10,
        totalPages: 1,
        totalCount: 0
    };

        // khi DOM đã sẵn sàng thì gọi hàm initPage để khởi tạo page
    document.addEventListener("DOMContentLoaded", initPage);

    // hàm khởi tạo page: kiểm tra role, gán event, tải dữ liệu phụ rồi load danh sách product

    async function initPage() {
        if (!role.guard(["Admin"])) return;

        bindEvents();
        await loadMeta();
        await loadProducts();
    }

    // gom toàn bộ event của page vào một chỗ để dễ quản lý

    function bindEvents() {
        dom.byId("btnProdSearch")?.addEventListener("click", searchProducts);
        dom.byId("btnProdClear")?.addEventListener("click", clearFilters);
        dom.byId("btnProdOpenCreate")?.addEventListener("click", openCreateModal);

        dom.byId("prodPrevBtn")?.addEventListener("click", prevPage);
        dom.byId("prodNextBtn")?.addEventListener("click", nextPage);

        dom.byId("btnProdCloseX")?.addEventListener("click", closeModal);
        dom.byId("btnProdCancel")?.addEventListener("click", closeModal);
        dom.byId("prodModalBackdrop")?.addEventListener("click", closeModal);

        dom.byId("btnProdUploadImage")?.addEventListener("click", uploadImage);
        dom.byId("btnProdClearImage")?.addEventListener("click", clearImage);
        dom.byId("prodSaveBtn")?.addEventListener("click", saveProduct);
        dom.byId("changeSizeBtn")?.addEventListener("click", reLoadProducts);
        
        dom.byId("kw")?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                searchProducts();
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeModal();
        });
    }

    // tải category và supplier để đổ vào filter và modal

    async function loadMeta() {
        state.categories = await loadAllPaged(API.category);
        state.suppliers = await loadAllPaged(API.supplier);

        fillSelect("catFilter", state.categories, "-- Tất cả Category --");
        fillSelect("prodCategoryId", state.categories, "-- Chọn Category --");
        fillSelect("supFilter", state.suppliers, "-- Tất cả Supplier --");
        fillSelect("prodSupplierId", state.suppliers, "-- Chọn Supplier --");
    }

    // hàm helper để load tất cả dữ liệu từ một endpoint có phân trang, trả về mảng gộp tất cả items
    async function loadAllPaged(endpoint) {
        const allItems = [];
        const pageSize = 200;   // số bản ghi mỗi trang khi load tất cả, 200 chắc dư xăng 
        let pageNumber = 1;
        let totalPages = 1;

        while (pageNumber <= totalPages) {
            const qs = new URLSearchParams();
            qs.set("PageNumber", String(pageNumber));
            qs.set("PageSize", String(pageSize));

            const result = await http.request("GET", `${endpoint}?${qs.toString()}`);

            if (!result?.res?.ok || !Array.isArray(result.data)) {
                break;
            }

            allItems.push(...result.data);

            const meta = pager.readMeta(result, result.data.length);
            totalPages = Math.max(1, Number(meta.totalPages || 1));
            pageNumber++;
        }

        // loại trùng theo id để an toàn
        const seen = new Set();
        return allItems.filter(x => {
            const key = String(x?.id || "").toLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    // render option cho thẻ select từ dữ liệu truyền vào

    function fillSelect(id, items, firstText) {
        const el = dom.byId(id);
        if (!el) return;

        const options = [];

        if (firstText !== undefined && firstText !== null) {
            options.push(`<option value="">${dom.esc(firstText)}</option>`);
        }

        for (const item of (items || [])) {
            options.push(
                `<option value="${dom.escAttr(item.id)}">${dom.esc(item.name || item.id)}</option>`
            );
        }

        el.innerHTML = options.join("");
    }

    // map categoryId sang tên category từ cache

    function getCategoryName(id) {
        const found = state.categories.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );
        return found?.name || "";
    }

    // map supplierId sang tên supplier từ cache

    function getSupplierName(id) {
        const found = state.suppliers.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );
        return found?.name || "";
    }

    async function reLoadProducts() {
        const tb = dom.byId("prodTbody");

        // tạo queryString để gửi filter / phân trang lên API
        const qs = new URLSearchParams();
        qs.set("PageNumber", 1);
        state.pageSize = parseInt(dom.byId("pageSize").value);
        qs.set("PageSize", state.pageSize);


        const result = await http.request("GET", `${API.product}?${qs.toString()}`);

        if (!result.res) {
            msg.show("prodMsg", result.raw || "Không gọi được API.", "error");
            if (tb) tb.innerHTML = `<tr><td colspan="9" class="muted">Lỗi tải dữ liệu.</td></tr>`;
            return;
        }

        if (!result.res.ok) {
            msg.show("prodMsg", http.getErrorText(result), "error");
            if (tb) tb.innerHTML = `<tr><td colspan="9" class="muted">Lỗi tải dữ liệu.</td></tr>`;
            return;
        }

        state.items = Array.isArray(result.data) ? result.data : [];

        const meta = pager.readMeta(result, state.items.length);
        state.pageNumber = Math.max(1, Number(meta.currentPage || 1));
        state.totalPages = Math.max(1, Number(meta.totalPages || 1));
        state.totalCount = Math.max(0, Number(meta.totalCount || 0));

        renderRows();
        renderPagerInfo();
    }

    // load danh sách product theo keyword, filter giá, category và phân trang

    async function loadProducts(clearMessage = true) {
        if (clearMessage) msg.show("prodMsg", "");

        const tb = dom.byId("prodTbody");
        if (tb) {
            tb.innerHTML = `<tr><td colspan="9" class="muted">Đang tải...</td></tr>`;
        }

        const kw = dom.value("kw");
        const catId = dom.byId("catFilter")?.value?.trim() || "";
        const supId = dom.byId("supFilter")?.value?.trim() || "";
        const minPrice = dom.byId("minPrice")?.value?.trim() || "";
        const maxPrice = dom.byId("maxPrice")?.value?.trim() || "";

        // tạo queryString để gửi filter / phân trang lên API
        const qs = new URLSearchParams();
        qs.set("PageNumber", String(state.pageNumber));
        qs.set("PageSize", String(state.pageSize));

        if (kw) qs.set("Keyword", kw);
        if (catId) qs.set("CategoryId", catId);
        if (supId) qs.set("SupplierId", supId);
        if (minPrice) qs.set("MinPrice", minPrice);
        if (maxPrice) qs.set("MaxPrice", maxPrice);

        const result = await http.request("GET", `${API.product}?${qs.toString()}`);

        if (!result.res) {
            msg.show("prodMsg", result.raw || "Không gọi được API.", "error");
            if (tb) tb.innerHTML = `<tr><td colspan="9" class="muted">Lỗi tải dữ liệu.</td></tr>`;
            return;
        }

        if (!result.res.ok) {
            msg.show("prodMsg", http.getErrorText(result), "error");
            if (tb) tb.innerHTML = `<tr><td colspan="9" class="muted">Lỗi tải dữ liệu.</td></tr>`;
            return;
        }

        state.items = Array.isArray(result.data) ? result.data : [];

        const meta = pager.readMeta(result, state.items.length);
        state.pageNumber = Math.max(1, Number(meta.currentPage || 1));
        state.totalPages = Math.max(1, Number(meta.totalPages || 1));
        state.totalCount = Math.max(0, Number(meta.totalCount || 0));

        renderRows();
        renderPagerInfo();
    }

    // render từng product ra table và gán sự kiện cho các nút sau khi render

    function renderRows() {
        const tb = dom.byId("prodTbody");
        if (!tb) return;

        if (!state.items || state.items.length === 0) {
            tb.innerHTML = `<tr><td colspan="9" class="muted">Không có dữ liệu.</td></tr>`;
            return;
        }

        tb.innerHTML = state.items.map((x, idx) => {
            const rowNo = ((state.pageNumber - 1) * state.pageSize) + idx + 1;
            const id = x.id;
            const name = x.productName ?? "";
            const catName = getCategoryName(x.categoryId) || "(không rõ)";
            const supName = getSupplierName(x.supplierId) || "(không rõ)";
            const quantity = Number(x.quantity ?? 0);
            const price = dom.money(x.price);
            const createdAt = dom.dateTime(x.createdAt);
            const img = (x.imageUrl || "").trim();

            const imgCell = img
                ? `<img class="thumb" src="${dom.escAttr(img)}" alt="${dom.escAttr(name)}" onerror="this.style.display='none'" />`
                : `<span class="muted">-</span>`;

            return `
                <tr>
                    <td>${rowNo}</td>
                    <td>${dom.esc(name)}</td>
                    <td>${imgCell}</td>
                    <td>${dom.esc(catName)}</td>
                    <td>${dom.esc(supName)}</td>
                    <td>${quantity}</td>
                    <td>${dom.esc(price)}</td>
                    <td>${dom.esc(createdAt)}</td>
                    <td>
                        <div class="row-actions">
                            <button class="btn" type="button" data-action="edit" data-id="${dom.escAttr(id)}">Sửa</button>
                            <button class="btn danger" type="button" data-action="delete" data-id="${dom.escAttr(id)}">Xoá</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

                // gán sự kiện cho từng nút sửa sau khi render xong table
        tb.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener("click", () => openEditModal(btn.dataset.id));
        });

                // gán sự kiện cho từng nút xóa sau khi render xong table
        tb.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener("click", () => askDelete(btn.dataset.id));
        });
    }

    // hiển thị thông tin phân trang và khóa/mở nút Prev Next

    function renderPagerInfo() {
        const info = dom.byId("prodPagerInfo");
        const prevBtn = dom.byId("prodPrevBtn");
        const nextBtn = dom.byId("prodNextBtn");

        if (info) {
            const from = state.totalCount === 0 ? 0 : ((state.pageNumber - 1) * state.pageSize) + 1;    // bản ghi đầu tiên
            const to = Math.min(state.pageNumber * state.pageSize, state.totalCount);                   // bản ghi cuối cùng
            info.textContent = `Trang ${state.pageNumber} / ${state.totalPages} • ${from}-${to} / ${state.totalCount}`;
        }

        if (prevBtn) prevBtn.disabled = state.pageNumber <= 1;
        if (nextBtn) nextBtn.disabled = state.pageNumber >= state.totalPages;
    }

    // tìm kiếm lại danh sách từ trang 1

    function searchProducts() {
        state.pageNumber = 1;
        loadProducts();
    }

    // xóa toàn bộ ô lọc rồi tải lại dữ liệu

    function clearFilters() {
        const kw = dom.byId("kw");
        const cat = dom.byId("catFilter");
        const sup = dom.byId("supFilter");
        const min = dom.byId("minPrice");
        const max = dom.byId("maxPrice");

        if (kw) kw.value = "";
        if (cat) cat.value = "";
        if (sup) sup.value = "";
        if (min) min.value = "";
        if (max) max.value = "";

        state.pageNumber = 1;
        loadProducts();
    }

    // lùi về trang trước

    function prevPage() {
        if (state.pageNumber <= 1) return;
        state.pageNumber--;
        loadProducts(false);
    }

    // sang trang tiếp theo

    function nextPage() {
        if (state.pageNumber >= state.totalPages) return;
        state.pageNumber++;
        loadProducts(false);
    }

    // mở modal tạo mới product và reset các input

    function openCreateModal() {
        state.mode = "create";
        state.editId = null;
        state.imageUrl = "";

        dom.setText("prodModalTitle", "Thêm Product");

        setInputValue("prodName", "");
        setInputValue("prodPrice", "");
        setInputValue("prodCategoryId", "");
        setInputValue("prodSupplierId", "");
        setDisabled("prodSupplierId", false);

        const file = dom.byId("prodImageFile");
        if (file) file.value = "";

        renderPreview("");
        msg.show("prodModalMsg", "");
        openModal();
    }

    // mở modal sửa và đổ dữ liệu product cần sửa vào form

    function openEditModal(id) {
        const item = state.items.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );

        if (!item) {
            msg.show("prodMsg", "Không tìm thấy product cần sửa.", "error");
            return;
        }

        state.mode = "edit";
        state.editId = item.id;
        state.imageUrl = item.imageUrl || "";

        dom.setText("prodModalTitle", "Sửa Product");

        setInputValue("prodName", item.productName || "");
        setInputValue("prodPrice", item.price ?? "");
        setInputValue("prodCategoryId", item.categoryId || "");
        setInputValue("prodSupplierId", item.supplierId || "");
        setDisabled("prodSupplierId", true);

        const file = dom.byId("prodImageFile");
        if (file) file.value = "";

        renderPreview(state.imageUrl);
        msg.show("prodModalMsg", "");
        openModal();
    }

    // mở modal product

    function openModal() {
        const modal = dom.byId("prodModal");
        if (modal) modal.classList.add("show");
        setTimeout(() => dom.byId("prodName")?.focus(), 0);
    }

    // đóng modal product

    function closeModal() {
        const modal = dom.byId("prodModal");
        if (modal) modal.classList.remove("show");
    }

    // gán value cho input/select theo id

    function setInputValue(id, value) {
        const el = dom.byId(id);
        if (el) el.value = value ?? "";
    }

    // khóa hoặc mở 1 control theo id

    function setDisabled(id, disabled) {
        const el = dom.byId(id);
        if (el) el.disabled = !!disabled;
    }

    // render ảnh preview từ imageUrl hiện tại

    function renderPreview(url) {
        const box = dom.byId("prodPreview");
        if (!box) return;

        const u = String(url || "").trim();

        if (!u) {
            box.textContent = "Chưa có ảnh.";
            return;
        }

        box.innerHTML = `<img src="${dom.escAttr(u)}" alt="preview" onerror="this.replaceWith(document.createTextNode('Không load được ảnh.'))" />`;
    }

    // validate dữ liệu rồi gọi API create/update product

    async function saveProduct() {
        const productName = dom.value("prodName");
        const categoryId = dom.byId("prodCategoryId")?.value?.trim() || "";
        const supplierId = dom.byId("prodSupplierId")?.value?.trim() || "";
        const priceRaw = dom.byId("prodPrice")?.value;
        const imageUrl = state.imageUrl;

        const price = Number(priceRaw);

        if (!productName) {
            msg.show("prodModalMsg", "Tên sản phẩm không được rỗng.", "error");
            return;
        }

        if (!categoryId) {
            msg.show("prodModalMsg", "Bạn cần chọn Category.", "error");
            return;
        }

        if (!supplierId) {
            msg.show("prodModalMsg", "Bạn cần chọn Supplier.", "error");
            return;
        }

        if (!isFinite(price) || price <= 0) {
            msg.show("prodModalMsg", "Giá phải lớn hơn 0.", "error");
            return;
        }

        if (!imageUrl) {
            msg.show("prodModalMsg", "Bạn cần upload ảnh sản phẩm.", "error");
            return;
        }

        const btn = dom.byId("prodSaveBtn");
        if (btn) {
            btn.disabled = true;
            btn.textContent = "Đang lưu...";
        }

        msg.show("prodModalMsg", "");

        let result;

        if (state.mode === "edit" && state.editId) {
            const body = {
                id: state.editId,
                categoryId,
                productName,
                price,
                imageUrl: imageUrl || ""
            };

            result = await http.request("PUT", `${API.product}/${encodeURIComponent(state.editId)}`, body);
        } else {
            const body = {
                categoryId,
                supplierId,
                productName,
                price,
                imageUrl: imageUrl || ""
            };

            result = await http.request("POST", API.product, body);
        }

        if (btn) {
            btn.disabled = false;
            btn.textContent = "Lưu";
        }

        if (!result.res) {
            msg.show("prodModalMsg", result.raw || "Không gọi được API.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show("prodModalMsg", http.getErrorText(result), "error");
            return;
        }

        const actionMode = state.mode;

        closeModal();

        if (actionMode === "create") {
            state.pageNumber = 1;
        }

        await loadProducts(false);

        msg.show("prodMsg", "Lưu thành công.", "success");
        setTimeout(() => msg.show("prodMsg", ""), 1800);
    }

    // hỏi lại người dùng trước khi xóa product

    function askDelete(id) {
        const item = state.items.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );

        const label = item?.productName ? `"${item.productName}"` : "product này";

        if (!confirm(`Xoá ${label}?`)) return;
        deleteProduct(id);
    }

    // gọi API xóa product rồi tải lại danh sách

    async function deleteProduct(id) {
        msg.show("prodMsg", "Đang xoá...", "warn");

        const result = await http.request("DELETE", `${API.product}/${encodeURIComponent(id)}`);

        if (!result.res) {
            msg.show("prodMsg", result.raw || "Không gọi được API.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show("prodMsg", http.getErrorText(result), "error");
            return;
        }

        if (state.items.length === 1 && state.pageNumber > 1) {
            state.pageNumber--;
        }

        await loadProducts(false);

        msg.show("prodMsg", "Đã xoá.", "success");
        setTimeout(() => msg.show("prodMsg", ""), 1800);
    }

    // upload file ảnh lên server và nhận lại URL để lưu product

    async function uploadImage() {
        const file = dom.byId("prodImageFile")?.files?.[0];     // lấy ảnh từ input type="file"
        if (!file) {
            msg.show("prodModalMsg", "Bạn chưa chọn file ảnh.", "warn");
            return;
        }

        const form = new FormData();        // tạo form data để gửi file ảnh lên API
        form.append("file", file);          // gán file vào form data với key "file"

        // disable nút lưu trong lúc đang upload 
        const saveBtn = dom.byId("prodSaveBtn");
        if (saveBtn) saveBtn.disabled = true;

        msg.show("prodModalMsg", "Đang upload ảnh...", "warn");

        try {
            // lấy token để gửi cùng header Authorization
            const token = StoreApp.auth.getAccessToken();
            const headers = {};
            if (token) headers["Authorization"] = "Bearer " + token;

            // gửi request upload ảnh lên server
            const res = await http.fetchWithAutoRefresh(API.uploadImage, {
                method: "POST",
                body: form
            });

            // lấy mọi kết quả trả về dưới dạng text 
            const raw = await res.text();
            let data = null;
            if (raw) {
                try { data = JSON.parse(raw); } catch { }
            }

            if (!res.ok) {
                msg.show("prodModalMsg", http.getErrorText({ data, raw }), "error");
                return;
            }

            const url = (typeof data === "string") ? data : (data?.url ?? raw);

            // nếu có url trả về thì gán vào state và hiển thị preview
            if (url) {
                state.imageUrl = String(url).trim();
                renderPreview(state.imageUrl);
                msg.show("prodModalMsg", "Upload thành công.", "success");
            } else {
                msg.show("prodModalMsg", "Upload xong nhưng không nhận được URL.", "warn");
            }
        } catch (err) {
            msg.show("prodModalMsg", String(err), "error");
        } finally {
            if (saveBtn) saveBtn.disabled = false;
        }
    }

    // xóa ảnh đang chọn trong modal và reset preview

    function clearImage() {
        state.imageUrl = "";

        const file = dom.byId("prodImageFile");
        if (file) file.value = "";

        renderPreview("");
        msg.show("prodModalMsg", "Đã xoá ảnh.", "success");
    }



    return {
        reload: loadProducts
    };
})();