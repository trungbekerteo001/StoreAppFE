let _prodMode = 'create';              // 'create' hoặc 'edit' => xác định modal đang thêm hay sửa
let _prodEditId = null;                // id product đang sửa (null nếu đang create)
let _prodCache = [];                   // cache danh sách product [{id,categoryId,supplierId,productName,price,imageUrl}] để render lại table
let _prodImageUrl = '';                // giữ URL của ảnh hiện tại trong modal 

let _prodPageNumber = 1;   // trang hiện tại
let _prodPageSize = 10;    // số dòng / trang
let _prodTotalPages = 1;   // tổng số trang
let _prodTotalCount = 0;   // tổng số bản ghi

let _catCache = [];                    // cache category [{id,name}] để map id -> name + đổ dropdown
let _supCache = [];                    // cache supplier [{id,name}] để map id -> name + đổ dropdown

const PROD_API = '/api/Product';       // route API product
const CAT_API = '/api/Category';       // route API category
const SUP_API = '/api/Supplier';       // route API supplier

// Auto chạy khi mở trang: load meta (category/supplier) trước, rồi load list product
document.addEventListener('DOMContentLoaded', async () => {
    await _loadMeta();
    await prodLoad();
});

// Load danh sách Category/Supplier từ API và cache lại để:
// - đổ dropdown filter Category
// - đổ dropdown Category/Supplier trong modal
// - map id -> name để hiển thị trong table
async function _loadMeta() {
    // Categories
    const catRes = await apiRequest('GET', CAT_API);
    const cats = (catRes?.res?.ok && Array.isArray(catRes.data)) ? catRes.data : [];   
    _catCache = cats;

    // Suppliers
    const supRes = await apiRequest('GET', SUP_API);
    const sups = (supRes?.res?.ok && Array.isArray(supRes.data)) ? supRes.data : [];
    _supCache = sups;

    // Đổ dropdown filter + dropdown trong modal
    _fillSelect('catFilter', _catCache, '-- Tất cả Category --');                   // dropdown filter trên toolbar
    _fillSelect('prodCategoryId', _catCache, '-- Chọn Category --');                // dropdown Category trong modal
    _fillSelect('prodSupplierId', _supCache, '-- Chọn Supplier --');                // dropdown Supplier trong modal
}

// render <select> từ list items dạng {id,name}
function _fillSelect(id, items, firstText) {
    const el = document.getElementById(id);             // trỏ đến select
    if (!el) return;

    const opts = [];                                     // list option html
    if (firstText !== null && firstText !== undefined) { // option đầu (placeholder)
        opts.push(`<option value="">${_escapeHtml(firstText)}</option>`);
    }

    for (const x of (items || [])) {                     // render từng item
        opts.push(`<option value="${_escapeHtml(x.id)}">${_escapeHtml(x.name || x.id)}</option>`);
    }

    el.innerHTML = opts.join('');                        // gắn vào DOM
}

// Map categoryId -> categoryName (hiển thị trong table)
function _catName(id) {
    const it = _catCache.find(x => String(x.id).toLowerCase() === String(id).toLowerCase()); // tìm theo id 
    return it?.name || '';                                                                   // nếu không có thì trả ''
}

// Map supplierId -> supplierName (hiển thị trong table)
function _supName(id) {
    const it = _supCache.find(x => String(x.id).toLowerCase() === String(id).toLowerCase());
    return it?.name || '';
}

// Load danh sách product theo filter (keyword, categoryId, minPrice, maxPrice)
async function prodLoad(clearMsg = true) {
    if (clearMsg) showMsg('prodMsg', '');       // lần đầu gọi thì clearMsg = true để clear msg nếu không khi đổi form nó mang msg theo

    const kw = document.getElementById('kw')?.value?.trim() || '';                 // keyword search
    const catId = document.getElementById('catFilter')?.value?.trim() || '';       // filter CategoryId
    const minPrice = document.getElementById('minPrice')?.value;                   // filter MinPrice
    const maxPrice = document.getElementById('maxPrice')?.value;                   // filter MaxPrice

    const qs = new URLSearchParams();                       // build query string
    qs.set('PageNumber', String(_prodPageNumber));
    qs.set('PageSize', String(_prodPageSize));

    if (kw) qs.set('Keyword', kw);
    if (catId) qs.set('CategoryId', catId);
    if (minPrice !== undefined && minPrice !== null && String(minPrice).trim() !== '') qs.set('MinPrice', String(minPrice));
    if (maxPrice !== undefined && maxPrice !== null && String(maxPrice).trim() !== '') qs.set('MaxPrice', String(maxPrice));

    const tb = document.getElementById('prodTbody');         // tbody của table
    if (tb) tb.innerHTML = `<tr><td colspan="9" class="muted">Đang tải...</td></tr>`; // set loading

    const result = await apiRequest('GET', `${PROD_API}${qs.toString() ? ('?' + qs.toString()) : ''}`); // gọi API GET /api/Product?...

    if (!result.res) {                                      // lỗi không có response (mạng/cors)
        showMsg('prodMsg', result.raw || 'Không gọi được API.', 'error');
        if (tb) tb.innerHTML = `<tr><td colspan="9" class="muted">Lỗi tải dữ liệu.</td></tr>`;
        return;
    }

    if (!result.res.ok) {                                   // API trả lỗi HTTP (400/401/500...)
        showMsg('prodMsg', getApiErrorText(result), 'error');
        if (tb) tb.innerHTML = `<tr><td colspan="7" class="muted">Lỗi tải dữ liệu.</td></tr>`;
        return;
    }

    const arr = Array.isArray(result.data) ? result.data : [];
    _prodCache = Array.isArray(arr) ? arr : [];

    const paginationRaw = result.res.headers.get('X-Pagination');
    if (paginationRaw) {
        try {
            const meta = JSON.parse(paginationRaw);
            _prodTotalPages = Math.max(1, Number(meta.TotalPages || 1));
            _prodPageNumber = Math.max(1, Number(meta.CurrentPage || _prodPageNumber));
            _prodTotalCount = Math.max(0, Number(meta.TotalCount || 0));
        } catch {
            _prodTotalPages = 1;
            _prodTotalCount = _prodCache.length;
        }
    } else {
        _prodTotalPages = 1;
        _prodTotalCount = _prodCache.length;
    }

    _renderProdRows(_prodCache);
    _renderProdPager();
}

function prodSearch() {         // nút "Tìm" => load lại theo filter do đã có logic trong prodLoad()
    _prodPageNumber = 1;
    prodLoad();
}                      

function prodClear() {                                     // nút "Reset" => clear filter rồi load lại
    const kw = document.getElementById('kw');
    const cat = document.getElementById('catFilter');
    const min = document.getElementById('minPrice');
    const max = document.getElementById('maxPrice');
    if (kw) kw.value = '';
    if (cat) cat.value = '';
    if (min) min.value = '';
    if (max) max.value = '';
    _prodPageNumber = 1;
    prodLoad();
}


// Render table product
function _renderProdRows(items) {
    const tb = document.getElementById('prodTbody');        // trỏ tbody table
    if (!tb) return;

    if (!items || items.length === 0) {                     // không có dữ liệu
        tb.innerHTML = `<tr><td colspan="9" class="muted">Không có dữ liệu.</td></tr>`;
        return;
    }

    tb.innerHTML = items.map((x, idx) => {
        const id = x.id;                                     // id product
        const name = x.productName ?? '';                    // tên product
        const catName = _catName(x.categoryId) || '(không rõ)';  // map categoryId -> categoryName
        const supName = _supName(x.supplierId) || '(không rõ)';  // map supplierId -> supplierName
        const quantity = Number(x.quantity ?? 0);
        const price = _fmtMoney(x.price);                    // format giá hiển thị
        const createdAt = _fmtDateTime(x.createdAt);
        const rowNo = ((_prodPageNumber - 1) * _prodPageSize) + idx + 1;
        const img = (x.imageUrl || '').trim();               // url ảnh
        const imgCell = img
            ? `<img class="thumb" src="${_escapeAttr(img)}" alt="${_escapeAttr(name)}" onerror="this.style.display='none'" />`
            : `<span class="muted">-</span>`;                // nếu không có ảnh => dấu "-"

        return `
            <tr>
                <td>${rowNo}</td>
                <td>${_escapeHtml(name)}</td>
                <td>${imgCell}</td>
                <td>${_escapeHtml(catName)}</td>
                <td>${_escapeHtml(supName)}</td>
                <td>${_escapeHtml(quantity)}</td>
                <td>${_escapeHtml(price)}</td>
                <td>${_escapeHtml(createdAt)}</td>
                <td>
                    <div class="row-actions">
                        <button class="btn" type="button" onclick="prodOpenEdit('${_escapeAttr(id)}')">Sửa</button>
                        <button class="btn danger" type="button" onclick="prodAskDelete('${_escapeAttr(id)}')">Xoá</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Format tiền theo vi-VN (vd: 12.000)
function _fmtMoney(v) {
    const n = Number(v);
    if (!isFinite(n)) return String(v ?? '');
    try { return new Intl.NumberFormat('vi-VN').format(n); }
    catch { return String(n); }
}

// Format ngày giờ theo vi-VN (vd: 31/12/2023, 23:59)  
function _fmtDateTime(v) {
    if (!v) return '-';

    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);

    try {
        return new Intl.DateTimeFormat('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(d);
    } catch {
        return d.toLocaleString('vi-VN');
    }
}

// mở modal tạo mới product
function prodOpenCreate() {
    _prodMode = 'create';                                  // set mode create
    _prodEditId = null;                                    // clear id edit

    const title = document.getElementById('prodModalTitle');
    if (title) title.textContent = 'Thêm Product';          // set title modal

    _setVal('prodName', '');                                // clear tên
    _setVal('prodPrice', '');                               // clear giá
    _setSelect('prodCategoryId', '');                       // clear category
    _setSelect('prodSupplierId', '');                       // clear supplier
    _setDisabled('prodSupplierId', false);                  // create => cho chọn supplier

    const file = document.getElementById('prodImageFile');  // reset file input
    if (file) file.value = '';

    _prodImageUrl = '';                                    // clear url ảnh state
    _renderPreview('');                                    // clear preview

    showMsg('prodModalMsg', '');                            // clear msg modal
    prodOpenModal();                                        // mở modal
}

// mở modal sửa product
function prodOpenEdit(id) {
    const item = _prodCache.find(x => String(x.id).toLowerCase() === String(id).toLowerCase()); // tìm item trong cache
    if (!item) {
        showMsg('prodMsg', 'Không tìm thấy product cần sửa.', 'error');
        return;
    }

    _prodMode = 'edit';                                    // set mode edit
    _prodEditId = item.id;                                 // set id edit

    const title = document.getElementById('prodModalTitle');
    if (title) title.textContent = 'Sửa Product';           // set title modal

    _setVal('prodName', item.productName || '');            // fill tên
    _setVal('prodPrice', item.price ?? '');                 // fill giá
    _setSelect('prodCategoryId', item.categoryId || '');    // fill category
    _setSelect('prodSupplierId', item.supplierId || '');    // fill supplier
    _setDisabled('prodSupplierId', true);                   // edit => khóa supplier, không cho sửa


    const file = document.getElementById('prodImageFile');  // reset file input
    if (file) file.value = '';

    _prodImageUrl = item.imageUrl || '';                    // load ảnh hiện tại vào state
    _renderPreview(_prodImageUrl);                          // preview ảnh hiện tại

    showMsg('prodModalMsg', '');
    prodOpenModal();
}

// mở modal (dùng chung create/edit)
function prodOpenModal() {
    const m = document.getElementById('prodModal');         // trỏ modal
    if (m) m.classList.add('show');                         // show modal
    const input = document.getElementById('prodName');      // focus ô tên
    setTimeout(() => input?.focus(), 0);
}

// đóng modal
function prodCloseModal() {
    const m = document.getElementById('prodModal');
    if (m) m.classList.remove('show');
}

// ESC đóng modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') prodCloseModal();
});

// helper get/set input
function _getVal(id) {
    return document.getElementById(id)?.value?.trim() || '';
}
function _setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
}
function _setSelect(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
}
function _setDisabled(id, disabled) {
    const el = document.getElementById(id);
    if (el) el.disabled = !!disabled;
}

// render preview ảnh
function _renderPreview(url) {
    const box = document.getElementById('prodPreview');
    if (!box) return;
    const u = (url || '').trim();
    if (!u) { box.textContent = 'Chưa có ảnh.'; return; }
    box.innerHTML = `<img src="${_escapeAttr(u)}" alt="preview" onerror="this.replaceWith(document.createTextNode('Không load được ảnh.'))" />`;
}

// Lưu product (dùng chung create/edit)
async function prodSave() {
    const productName = _getVal('prodName');                        // lấy tên
    const categoryId = _getVal('prodCategoryId');                   // lấy categoryId
    const supplierId = _getVal('prodSupplierId');                   // lấy supplierId
    const priceRaw = document.getElementById('prodPrice')?.value;   // lấy giá
    const imageUrl = _prodImageUrl;                                 // lấy ảnh từ state (không nhập tay)

    const price = Number(priceRaw);                                 // convert sang number

    // validate client
    if (!productName) { showMsg('prodModalMsg', 'Tên sản phẩm không được rỗng.', 'error'); return; }
    if (!categoryId) { showMsg('prodModalMsg', 'Bạn cần chọn Category.', 'error'); return; }
    if (!supplierId) { showMsg('prodModalMsg', 'Bạn cần chọn Supplier.', 'error'); return; }
    if (!isFinite(price) || price <= 0) {
        showMsg('prodModalMsg', 'Giá phải lớn hơn 0.', 'error');
        return;
    }

    if (!imageUrl) {
        showMsg('prodModalMsg', 'Bạn cần upload ảnh sản phẩm.', 'error');
        return;
    }

    const btn = document.getElementById('prodSaveBtn');             // disable nút save để tránh bấm nhiều lần
    if (btn) { btn.disabled = true; btn.textContent = 'Đang lưu...'; }
    showMsg('prodModalMsg', '');                                    // clear msg modal

    let result;

    // EDIT => PUT /api/Product/{id}
    if (_prodMode === 'edit' && _prodEditId) {
        const body = {
            id: _prodEditId,
            categoryId,
            productName,
            price,
            imageUrl: (imageUrl || '')     // tránh null để khỏi lỗi DB NOT NULL
        };
        result = await apiRequest('PUT', `${PROD_API}/${encodeURIComponent(_prodEditId)}`, body);
    } else {
        // CREATE => POST /api/Product
        const body = {
            categoryId,
            supplierId,
            productName,
            price,
            imageUrl: (imageUrl || '')     // tránh null để khỏi lỗi DB NOT NULL
        };
        result = await apiRequest('POST', `${PROD_API}`, body);
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Lưu'; }     // enable lại nút sau khi API trả về

    if (!result.res) {                                              // lỗi không có response
        showMsg('prodModalMsg', result.raw || 'Không gọi được API.', 'error');
        return;
    }

    if (!result.res.ok) {                                           // API trả lỗi (400/401/500...)
        showMsg('prodModalMsg', getApiErrorText(result), 'error');
        return;
    }

    prodCloseModal();                                               // đóng modal khi lưu OK
    if (_prodMode === 'create') _prodPageNumber = 1;
    await prodLoad(false);
    showMsg('prodMsg', 'Lưu thành công.', 'success');               // báo thành công ngoài list
    setTimeout(() => showMsg('prodMsg', ''), 1800);                                
}

function prodAskDelete(id) {
    const item = _prodCache.find(x => String(x.id).toLowerCase() === String(id).toLowerCase());  // tìm item trong cache
    const label = item?.productName ? `"${item.productName}"` : 'product này';
    if (!confirm(`Xoá ${label}?`)) return;                           // confirm trước khi xoá
    prodDelete(id);                                                 // gọi xoá
}

async function prodDelete(id) {
    showMsg('prodMsg', 'Đang xoá...', 'warn');                       // show đang xoá

    const result = await apiRequest('DELETE', `${PROD_API}/${encodeURIComponent(id)}`); // gọi API xoá

    if (!result.res) {
        showMsg('prodMsg', result.raw || 'Không gọi được API.', 'error');
        return;
    }

    if (!result.res.ok) {
        showMsg('prodMsg', getApiErrorText(result), 'error');
        return;
    }

    // khi xóa bản ghi cuồi cùng của trang thì lùi 1 trang 
    if (_prodCache.length === 1 && _prodPageNumber > 1) {
        _prodPageNumber--;
    }
    await prodLoad(false);
    showMsg('prodMsg', 'Đã xoá.', 'success');
    setTimeout(() => showMsg('prodMsg', ''), 1800);
}

// up load ảnh sản phẩm: gọi API upload, nhận về URL rồi lưu vào state + show preview (chưa lưu xuống DB cho tới khi bấm Lưu)
async function prodUploadImage() {
    const file = document.getElementById('prodImageFile')?.files?.[0]; // lấy file từ input
    if (!file) { showMsg('prodModalMsg', 'Bạn chưa chọn file ảnh.', 'warn'); return; }

    const form = new FormData();                                    // tạo form-data để gửi file
    form.append('file', file);                                      // key = "file" phải khớp [FromForm] IFormFile file

    const btn = document.getElementById('prodSaveBtn');             // disable save trong lúc upload
    if (btn) btn.disabled = true;

    showMsg('prodModalMsg', 'Đang upload ảnh...', 'warn');

    try {
        const res = await fetch(apiUrl('/api/Product/upload-image'), {
            method: 'POST',
            headers: (() => {
                const token = (typeof getAccessToken === 'function') ? getAccessToken() : null; // lấy token
                const h = {};
                if (token) h['Authorization'] = 'Bearer ' + token;  // gắn Bearer token nếu có
                return h;                                           // không set Content-Type (FormData tự set)
            })(),
            body: form                                              // gửi form-data
        });

        const raw = await res.text();                               // đọc response text
        let data = null;
        if (raw) { try { data = JSON.parse(raw); } catch { } }      // parse JSON nếu có

        if (!res.ok) {                                              // upload lỗi
            showMsg('prodModalMsg', data?.detail || data?.message || 'Có lỗi xảy ra.', 'error');
            return;
        }

        // BE trả { url: "..." } hoặc có thể trả string
        const url = (typeof data === 'string') ? data : (data?.url ?? raw);

        if (url) {
            _prodImageUrl = String(url).trim();                     // lưu url vào state để khi Save gửi lên BE
            _renderPreview(_prodImageUrl);                           // show preview
            showMsg('prodModalMsg', 'Upload thành công.', 'success');
        } else {
            showMsg('prodModalMsg', 'Upload xong nhưng không nhận được URL.', 'warn');
        }
    } catch (err) {
        showMsg('prodModalMsg', String(err), 'error');              // lỗi JS runtime
    } finally {
        if (btn) btn.disabled = false;                              // bật lại nút save
    }
}

// Xoá ảnh trong modal (chỉ xoá state + preview, chưa lưu xuống DB cho tới khi bấm Lưu)
function prodClearImage() {
    _prodImageUrl = '';                                            // clear URL ảnh hiện tại
    const file = document.getElementById('prodImageFile');         // clear file input
    if (file) file.value = '';
    _renderPreview('');                                             // clear preview
    showMsg('prodModalMsg', 'Đã xoá ảnh.', 'success');
}


// escape text để tránh lỗi HTML khi tên có ký tự đặc biệt (&, <, >, ...)
function _escapeHtml(s) {
    return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

// escape cho attribute (src="", onclick="")
function _escapeAttr(s) {
    return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

// các hàm phân trang 
function prodPrevPage() {
    if (_prodPageNumber <= 1) return;
    _prodPageNumber--;
    prodLoad(false);
}

function prodNextPage() {
    if (_prodPageNumber >= _prodTotalPages) return;
    _prodPageNumber++;
    prodLoad(false);
}

function _renderProdPager() {
    const info = document.getElementById('prodPagerInfo');
    const prevBtn = document.getElementById('prodPrevBtn');
    const nextBtn = document.getElementById('prodNextBtn');

    if (info) {
        const from = _prodTotalCount === 0 ? 0 : ((_prodPageNumber - 1) * _prodPageSize) + 1;
        const to = Math.min(_prodPageNumber * _prodPageSize, _prodTotalCount);
        info.textContent = `Trang ${_prodPageNumber} / ${_prodTotalPages} • ${from}-${to} / ${_prodTotalCount}`;
    }

    if (prevBtn) prevBtn.disabled = _prodPageNumber <= 1;
    if (nextBtn) nextBtn.disabled = _prodPageNumber >= _prodTotalPages;
}