let _grnMode = 'create';          // 'create' | 'edit' | 'view' => xác định modal đang thêm, sửa hay chỉ xem
let _grnEditId = null;            // id phiếu nhập đang sửa/xem (null nếu đang create)
let _grnCache = [];               // cache danh sách GRN [{id,supplierId,grnStatus,updatedAt,items}] để render lại table
let _grnSupCache = [];            // cache danh sách supplier [{id,name}] để map supplierId -> supplierName + đổ dropdown
let _grnProdCache = [];           // cache danh sách product [{id,productName,...}] để map productId -> productName + đổ dropdown

let _grnPageNumber = 1;   // trang hiện tại
let _grnPageSize = 10;    // số dòng / trang
let _grnTotalPages = 1;   // tổng số trang
let _grnTotalCount = 0;   // tổng số bản ghi

const GRN_API = '/api/GRN';       // route API GRN
const SUP_API = '/api/Supplier';  // route API Supplier
const PROD_API = '/api/Product';  // route API Product

// Auto chạy khi mở trang:
// 1. load meta (supplier/product) trước
// 2. sau đó load list GRN
document.addEventListener('DOMContentLoaded', async () => {
    await _grnLoadMeta();         // tải supplier + product để có dropdown + map tên
    await grnLoad();              // tải danh sách phiếu nhập
});

// Load danh sách Supplier/Product từ API và cache lại để:
// - đổ dropdown filter Supplier
// - đổ dropdown Supplier trong modal
// - đổ dropdown Product trong từng dòng item
// - map id -> tên để hiển thị trong table/modal
async function _grnLoadMeta() {
    const supRes = await apiRequest('GET', `${SUP_API}?PageSize=100`);    // gọi API lấy supplier
    _grnSupCache = (supRes?.res?.ok && Array.isArray(supRes.data)) ? supRes.data : [];

    const prodRes = await apiRequest('GET', `${PROD_API}?PageSize=100`);  // gọi API lấy product
    _grnProdCache = (prodRes?.res?.ok && Array.isArray(prodRes.data)) ? prodRes.data : [];

    _fillSelect('grnSupplierFilter', _grnSupCache, '-- Tất cả Supplier --', x => x.name || x.id); // filter Supplier trên toolbar
    _fillSelect('grnSupplierId', _grnSupCache, '-- Chọn Supplier --', x => x.name || x.id);       // dropdown Supplier trong modal
}

// render <select> từ list items dạng {id,...}
// id: id của thẻ select
// items: dữ liệu nguồn
// firstText: option đầu tiên
// labelFn: hàm lấy text hiển thị của từng option
function _fillSelect(id, items, firstText, labelFn) {
    const el = document.getElementById(id);                      // trỏ đến select
    if (!el) return;

    const opts = [];                                             // list option html
    if (firstText !== null && firstText !== undefined) {         // option đầu (placeholder)
        opts.push(`<option value="">${_escapeHtml(firstText)}</option>`);
    }

    for (const x of (items || [])) {                             // render từng item
        const label = typeof labelFn === 'function'
            ? labelFn(x)
            : (x.name || x.productName || x.id);

        opts.push(`<option value="${_escapeHtml(x.id)}">${_escapeHtml(label)}</option>`);
    }

    el.innerHTML = opts.join('');                                // gắn vào DOM
}

// Map supplierId -> supplierName (hiển thị trong table)
function _supplierName(id) {
    const item = _grnSupCache.find(x => String(x.id).toLowerCase() === String(id).toLowerCase()); // tìm supplier theo id
    return item?.name || '';                                                                          // nếu không có thì trả ''
}

// Map productId -> productName (hiển thị trong dòng item)
function _productName(id) {
    const item = _grnProdCache.find(x => String(x.id).toLowerCase() === String(id).toLowerCase()); // tìm product theo id
    return item?.productName || '';
}

// đổi trạng thái backend -> text tiếng Việt để hiển thị
function _statusText(status) {
    const s = String(status || '').toLowerCase();     // normalize về lowercase
    if (s === 'completed') return 'Completed';
    if (s === 'canceled') return 'Canceled';
    return 'Pending';
}

// đổi trạng thái backend -> class css badge
function _statusClass(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'completed') return 'completed';
    if (s === 'canceled') return 'canceled';
    return 'pending';
}

// format tiền theo vi-VN (vd: 9.100 ₫)
function _fmtMoney(n) {
    const num = Number(n || 0);                         // convert về number
    return `${num.toLocaleString('vi-VN')} ₫`;
}

// format ngày giờ để hiển thị trên table
function _fmtDate(s) {
    if (!s) return '—';                                // không có giá trị => gạch ngang

    const d = new Date(s);                             // parse ngày
    if (Number.isNaN(d.getTime())) return _escapeHtml(String(s)); // parse lỗi thì trả text gốc

    return d.toLocaleString('vi-VN');                  // format theo local vi-VN
}

// rút gọn id dài để hiển thị trên table
function _shortId(id) {
    const x = String(id || '');
    return x.length > 8 ? x.slice(0, 8) + '...' : x;   // lấy 8 ký tự đầu nếu id quá dài
}

// đảm bảo items luôn là mảng
function _safeItems(items) {
    return Array.isArray(items) ? items : [];
}

// tính tổng cho 1 phiếu nhập:
// - số dòng
// - tổng số lượng
// - tổng tiền
function _calcTotals(items) {
    const safe = _safeItems(items);

    return safe.reduce((acc, x) => {
        const qty = Number(x.quantity || 0);           // số lượng
        const price = Number(x.price || 0);            // đơn giá

        acc.lines += 1;                                // tăng số dòng
        acc.qty += qty;                                // cộng dồn số lượng
        acc.amount += qty * price;                     // cộng dồn thành tiền

        return acc;
    }, { lines: 0, qty: 0, amount: 0 });
}

// Load danh sách GRN theo filter (supplier, status)
async function grnLoad(clearMsg = true) {
    if (clearMsg) showMsg('grnMsg', '');               // lần đầu load thì clear thông báo cũ

    const supplierId = document.getElementById('grnSupplierFilter')?.value?.trim() || ''; // filter Supplier
    const status = document.getElementById('grnStatusFilter')?.value?.trim() || '';       // filter Status

    const qs = new URLSearchParams();                  // build query string

    qs.set('PageNumber', String(_grnPageNumber));
    qs.set('PageSize', String(_grnPageSize));

    if (supplierId) qs.set('Supplier', supplierId);   // thêm filter supplier nếu có
    if (status) qs.set('GRNStatus', status);          // thêm filter trạng thái nếu có

    const tb = document.getElementById('grnTbody');   // tbody của table
    if (tb) tb.innerHTML = `<tr><td colspan="9" class="muted">Đang tải...</td></tr>`; // set loading

    const result = await apiRequest('GET', `${GRN_API}${qs.toString() ? ('?' + qs.toString()) : ''}`); // gọi API GET /api/GRN?...

    if (!result.res) {                                // lỗi không có response (mạng/cors)
        showMsg('grnMsg', result.raw || 'Không gọi được API.', 'error');
        if (tb) tb.innerHTML = `<tr><td colspan="9" class="muted">Lỗi tải dữ liệu.</td></tr>`;
        return;
    }

    if (!result.res.ok) {                             // API trả lỗi HTTP (400/401/500...)
        showMsg('grnMsg', getApiErrorText(result), 'error');
        if (tb) tb.innerHTML = `<tr><td colspan="9" class="muted">Lỗi tải dữ liệu.</td></tr>`;
        return;
    }

    _grnCache = Array.isArray(result.data) ? result.data : []; // cache danh sách GRN

    const paginationRaw = result.res.headers.get('X-Pagination');
    if (paginationRaw) {
        try {
            const meta = JSON.parse(paginationRaw);
            _grnTotalPages = Math.max(1, Number(meta.TotalPages || 1));
            _grnPageNumber = Math.max(1, Number(meta.CurrentPage || _grnPageNumber));
            _grnTotalCount = Math.max(0, Number(meta.TotalCount || 0));
        } catch {
            _grnTotalPages = 1;
            _grnTotalCount = _grnCache.length;
        }
    } else {
        _grnTotalPages = 1;
        _grnTotalCount = _grnCache.length;
    }

    _renderGrnRows(_grnCache);                                 // render table
    _renderGrnPager();
}

function grnSearch() {                                        // nút "Tìm" => load lại theo filter hiện tại
    _grnPageNumber = 1;
    grnLoad();
}

function grnClear() {                                         // nút "Reset" => clear filter rồi load lại
    const sup = document.getElementById('grnSupplierFilter');
    const status = document.getElementById('grnStatusFilter');

    if (sup) sup.value = '';
    if (status) status.value = '';

    _grnPageNumber = 1;
    grnLoad();
}

// set tiêu đề + mô tả cho modal
function _setModalMeta(title, sub) {
    const titleEl = document.getElementById('grnModalTitle'); // title modal
    const subEl = document.getElementById('grnModalSub');     // sub title modal

    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = sub;
}

// set value cho input/select theo id
function _setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
}

// mở modal
function grnOpenModal() {
    const m = document.getElementById('grnModal');            // trỏ modal
    if (m) m.classList.add('show');                           // show modal

    setTimeout(() => document.getElementById('grnSupplierId')?.focus(), 0); // focus vào supplier
}

// đóng modal
function grnCloseModal() {
    const m = document.getElementById('grnModal');
    if (m) m.classList.remove('show');
}

// ESC đóng modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') grnCloseModal();
});

// mở modal tạo mới phiếu nhập
function grnOpenCreate() {
    _grnMode = 'create';                                      // set mode create
    _grnEditId = null;                                        // clear id edit

    _setModalMeta('Thêm phiếu nhập', 'Chọn supplier và khai báo các mặt hàng nhập kho.');
    _setVal('grnSupplierId', '');                             // clear supplier

    _renderItemRows([{ productId: '', quantity: 1, price: 0 }]); // mặc định có 1 dòng rỗng
    _applyModalState();                                       // apply trạng thái control
    showMsg('grnModalMsg', '');                               // clear msg modal
    grnOpenModal();                                           // mở modal
}

// mở modal xem chi tiết phiếu nhập
async function grnOpenView(id) {
    await _grnOpenExisting(id, 'view');
}

// mở modal sửa phiếu nhập
async function grnOpenEdit(id) {
    await _grnOpenExisting(id, 'edit');
}

// hàm dùng chung cho view/edit:
// gọi API lấy 1 phiếu nhập theo id
// rồi đổ dữ liệu vào modal
async function _grnOpenExisting(id, mode) {
    showMsg('grnMsg', '');                                    // clear msg ngoài list

    const result = await apiRequest('GET', `${GRN_API}/${encodeURIComponent(id)}`); // GET /api/GRN/{id}

    if (!result.res) {                                        // lỗi không có response
        showMsg('grnMsg', result.raw || 'Không gọi được API.', 'error');
        return;
    }

    if (!result.res.ok) {                                     // API trả lỗi
        showMsg('grnMsg', getApiErrorText(result), 'error');
        return;
    }

    const item = result.data || {};                           // dữ liệu phiếu nhập
    _grnMode = mode;                                          // set mode view/edit
    _grnEditId = item.id || id;                               // lưu id hiện tại

    if (mode === 'view') {
        _setModalMeta('Chi tiết phiếu nhập', 'Xem thông tin phiếu nhập và các mặt hàng đã khai báo.');
    } else {
        _setModalMeta('Sửa phiếu nhập', 'Chỉ phiếu ở trạng thái chờ duyệt mới được chỉnh sửa.');
    }

    _setVal('grnSupplierId', item.supplierId || '');          // fill supplier
    const items = _safeItems(item.items);                     // lấy mảng items
    _renderItemRows(items.length ? items : [{ productId: '', quantity: 1, price: 0 }]); // render item rows

    _applyModalState(item.grnStatus);                         // khóa/mở control tùy theo mode + status
    showMsg('grnModalMsg', '');                               // clear msg modal
    grnOpenModal();                                           // mở modal
}

// khóa/mở control trong modal theo mode:
// - view => readonly hoàn toàn
// - edit + pending => cho sửa
// - edit + completed/canceled => readonly
// - create => cho nhập
function _applyModalState(status) {
    const isReadOnly =
        _grnMode === 'view' ||
        String(status || '').toLowerCase() !== '' &&
        String(status).toLowerCase() !== 'pending' &&
        _grnMode !== 'create';

    const supplierEl = document.getElementById('grnSupplierId'); // dropdown supplier
    const saveBtn = document.getElementById('grnSaveBtn');       // nút lưu
    const addBtn = document.getElementById('grnAddRowBtn');      // nút thêm dòng

    if (supplierEl) supplierEl.disabled = _grnMode !== 'create'; // supplier chỉ chọn khi create
    if (saveBtn) saveBtn.style.display = isReadOnly ? 'none' : 'inline-flex'; // readonly => ẩn nút lưu
    if (addBtn) addBtn.style.display = isReadOnly ? 'none' : 'inline-flex';   // readonly => ẩn nút thêm dòng

    document.querySelectorAll('#grnItemsTbody select, #grnItemsTbody input').forEach(el => {
        el.disabled = isReadOnly;                               // disable toàn bộ input/select item
    });

    document.querySelectorAll('.grn-remove-row').forEach(el => {
        el.style.display = isReadOnly ? 'none' : 'inline-flex'; // readonly => ẩn nút xóa dòng
    });
}

// build option product cho từng dòng item
function _productOptions(selectedId) {
    const opts = ['<option value="">-- Chọn sản phẩm --</option>']; // option mặc định

    for (const x of _grnProdCache) {                                 // render từng product
        const selected = String(x.id).toLowerCase() === String(selectedId || '').toLowerCase()
            ? ' selected'
            : '';

        const label = `${x.productName || x.id}`;
        opts.push(`<option value="${_escapeHtml(x.id)}"${selected}>${_escapeHtml(label)}</option>`);
    }

    return opts.join('');
}

// thêm 1 dòng item mới vào modal
function grnAddItemRow() {
    const current = _readItemsFromDom(false);                       // đọc các dòng hiện tại từ DOM
    current.push({ productId: '', quantity: 1, price: 0 });        // thêm 1 dòng rỗng

    _renderItemRows(current);                                       // render lại table item
    _applyModalState();                                             // apply lại trạng thái control
}

// xóa 1 dòng item theo index
function grnRemoveItemRow(index) {
    const current = _readItemsFromDom(false);                       // đọc các dòng hiện tại
    current.splice(index, 1);                                       // xóa 1 dòng theo vị trí

    _renderItemRows(current.length ? current : [{ productId: '', quantity: 1, price: 0 }]); // nếu hết thì chừa 1 dòng rỗng
    _applyModalState();
}

// render toàn bộ các dòng item ra tbody trong modal
function _renderItemRows(items) {
    const tb = document.getElementById('grnItemsTbody');            // trỏ tbody item
    if (!tb) return;

    const safe = _safeItems(items);
    if (!safe.length) {                                             // không có item
        tb.innerHTML = `<tr><td colspan="6" class="empty-row">Chưa có dữ liệu.</td></tr>`;
        _updateSummary([]);
        return;
    }

    tb.innerHTML = safe.map((x, idx) => {
        const productId = x.productId || '';                        // productId của dòng
        const quantity = Number(x.quantity || 0);                   // quantity của dòng
        const price = Number(x.price || 0);                         // price của dòng
        const amount = quantity * price;                            // thành tiền của dòng

        return `
            <tr>
                <td>${idx + 1}</td>                                 <!-- STT -->
                <td>
                    <select class="grn-item-product" onchange="grnRefreshSummary()">
                        ${_productOptions(productId)}
                    </select>
                </td>
                <td>
                    <input class="grn-item-qty" type="number" min="1" step="1" value="${quantity || 1}" oninput="grnRefreshSummary()" />
                </td>
                <td>
                    <input class="grn-item-price" type="number" min="0" step="0.01" value="${price || 0}" oninput="grnRefreshSummary()" />
                </td>
                <td class="line-total">${_fmtMoney(amount)}</td>
                <td>
                    <button class="btn danger grn-remove-row" type="button" onclick="grnRemoveItemRow(${idx})">Xóa</button>
                </td>
            </tr>
        `;
    }).join('');

    _updateSummary(safe);                                           // cập nhật summary sau khi render
}

// đọc dữ liệu hiện tại từ DOM item table
// strict = true  => giữ cả dòng rỗng để validate
// strict = false => bỏ qua dòng chưa chọn product
function _readItemsFromDom(strict = true) {
    const rows = Array.from(document.querySelectorAll('#grnItemsTbody tr')); // lấy tất cả row hiện tại
    const items = [];

    for (const row of rows) {
        const productId = row.querySelector('.grn-item-product')?.value?.trim() || ''; // lấy productId
        const quantity = Number(row.querySelector('.grn-item-qty')?.value || 0);       // lấy quantity
        const price = Number(row.querySelector('.grn-item-price')?.value || 0);         // lấy price

        if (!productId && !strict) continue;                           // non-strict thì bỏ qua dòng rỗng

        items.push({ productId, quantity, price });                    // push vào mảng item
    }

    return items;
}

// cập nhật phần summary cuối modal:
// - số dòng
// - tổng số lượng
// - tổng tiền
// đồng thời cập nhật thành tiền từng dòng
function _updateSummary(items) {
    const current = Array.isArray(items) ? items : _readItemsFromDom(false); // nếu không truyền items thì đọc từ DOM
    const totals = _calcTotals(current);                                      // tính tổng

    Array.from(document.querySelectorAll('#grnItemsTbody tr')).forEach((row, idx) => {
        const qty = Number(row.querySelector('.grn-item-qty')?.value || 0);   // quantity từng dòng
        const price = Number(row.querySelector('.grn-item-price')?.value || 0); // price từng dòng
        const cell = row.querySelector('.line-total');                         // ô thành tiền
        if (cell) cell.textContent = _fmtMoney(qty * price);                   // cập nhật thành tiền từng dòng
    });

    const linesEl = document.getElementById('grnSummaryLines');                // box số dòng
    const qtyEl = document.getElementById('grnSummaryQty');                    // box tổng số lượng
    const amountEl = document.getElementById('grnSummaryAmount');              // box tổng tiền

    if (linesEl) linesEl.textContent = String(totals.lines);
    if (qtyEl) qtyEl.textContent = String(totals.qty);
    if (amountEl) amountEl.textContent = _fmtMoney(totals.amount);
}

// hàm gọi nhanh khi đổi product / quantity / price
function grnRefreshSummary() {
    _updateSummary();
}

// validate dữ liệu trước khi lưu
function _validatePayload(supplierId, items) {
    if (!supplierId) return 'Bạn chưa chọn supplier.';                         // thiếu supplier
    if (!items.length) return 'Phiếu nhập phải có ít nhất 1 dòng hàng.';      // không có item

    const seen = new Set();                                                     // để check trùng product

    for (let i = 0; i < items.length; i++) {
        const x = items[i];

        if (!x.productId) return `Dòng ${i + 1} chưa chọn sản phẩm.`;         // thiếu product
        if (!Number.isFinite(x.quantity) || x.quantity <= 0) return `Dòng ${i + 1} có số lượng không hợp lệ.`; // quantity lỗi
        if (!Number.isFinite(x.price) || x.price < 0) return `Dòng ${i + 1} có đơn giá không hợp lệ.`;         // price lỗi

        const key = String(x.productId).toLowerCase();                         // normalize productId
        if (seen.has(key)) return `Sản phẩm ở dòng ${i + 1} đang bị trùng.`;  // không cho trùng product
        seen.add(key);
    }

    return '';                                                                 // hợp lệ
}

// lưu phiếu nhập:
// - create => POST /api/GRN
// - edit   => PUT /api/GRN/{id}
async function grnSave() {
    const supplierId = document.getElementById('grnSupplierId')?.value?.trim() || ''; // lấy supplierId
    const items = _readItemsFromDom(true);                                            // lấy items từ DOM
    const validation = _validatePayload(supplierId, items);                            // validate client

    if (validation) {
        showMsg('grnModalMsg', validation, 'error');
        return;
    }

    const btn = document.getElementById('grnSaveBtn');                                 // nút lưu
    if (btn) { btn.disabled = true; btn.textContent = 'Đang lưu...'; }                 // disable tránh bấm nhiều lần
    showMsg('grnModalMsg', '');                                                         // clear msg modal

    let result;

    if (_grnMode === 'edit' && _grnEditId) {
        result = await apiRequest('PUT', `${GRN_API}/${encodeURIComponent(_grnEditId)}`, { items }); // update chỉ gửi items
    } else {
        result = await apiRequest('POST', GRN_API, { supplierId, items });                           // create gửi supplierId + items
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Lưu'; }                      // enable lại nút sau khi API trả về

    if (!result.res) {                                                                // lỗi không có response
        showMsg('grnModalMsg', result.raw || 'Không gọi được API.', 'error');
        return;
    }

    if (!result.res.ok) {                                                             // API trả lỗi
        showMsg('grnModalMsg', getApiErrorText(result), 'error');
        return;
    }

    grnCloseModal();                                                                  // đóng modal khi lưu OK

    if (_grnMode === 'create') {
        _grnPageNumber = 1;
    }

    await grnLoad(false);                                                             // load lại list
    showMsg('grnMsg', _grnMode === 'edit' ? 'Cập nhật phiếu nhập thành công.' : 'Tạo phiếu nhập thành công.', 'success');
    setTimeout(() => showMsg('grnMsg', ''), 1800);                                    // tự ẩn thông báo sau 1.8s
}

// confirm trước khi duyệt phiếu
function grnAskComplete(id) {
    if (!confirm('Duyệt phiếu nhập này? Khi duyệt, tồn kho sản phẩm sẽ được cộng thêm.')) return; // confirm
    grnComplete(id);                                                                                 // gọi duyệt
}

// gọi API duyệt phiếu nhập
async function grnComplete(id) {
    showMsg('grnMsg', 'Đang duyệt phiếu nhập...', 'warn');                            // báo đang xử lý

    const result = await apiRequest('PUT', `${GRN_API}/${encodeURIComponent(id)}/complete`); // PUT /complete

    if (!result.res) {
        showMsg('grnMsg', result.raw || 'Không gọi được API.', 'error');
        return;
    }

    if (!result.res.ok) {
        showMsg('grnMsg', getApiErrorText(result), 'error');
        return;
    }

    await grnLoad(false);                                                             // load lại list
    showMsg('grnMsg', 'Duyệt phiếu nhập thành công.', 'success');                     // báo thành công
    setTimeout(() => showMsg('grnMsg', ''), 1800);
}

// confirm trước khi hủy phiếu
function grnAskCancel(id) {
    if (!confirm('Hủy phiếu nhập này?')) return;                                      // confirm
    grnCancel(id);                                                                    // gọi hủy
}

// gọi API hủy phiếu nhập
async function grnCancel(id) {
    showMsg('grnMsg', 'Đang hủy phiếu nhập...', 'warn');                              // báo đang xử lý

    const result = await apiRequest('PUT', `${GRN_API}/${encodeURIComponent(id)}/cancel`); // PUT /cancel

    if (!result.res) {
        showMsg('grnMsg', result.raw || 'Không gọi được API.', 'error');
        return;
    }

    if (!result.res.ok) {
        showMsg('grnMsg', getApiErrorText(result), 'error');
        return;
    }

    await grnLoad(false);                                                             // load lại list
    showMsg('grnMsg', 'Hủy phiếu nhập thành công.', 'success');
    setTimeout(() => showMsg('grnMsg', ''), 1800);
}

// render table GRN
function _renderGrnRows(items) {
    const tb = document.getElementById('grnTbody');                                   // trỏ tbody
    if (!tb) return;

    if (!items || !items.length) {                                                    // không có dữ liệu
        tb.innerHTML = `<tr><td colspan="9" class="muted">Không có dữ liệu.</td></tr>`;
        return;
    }

    tb.innerHTML = items.map((x, idx) => {
        const supplierName = _supplierName(x.supplierId) || x.supplierId || '—';      // map supplierId -> supplierName
        const statusText = _statusText(x.grnStatus);                                   // text trạng thái
        const statusClass = _statusClass(x.grnStatus);                                 // class badge
        const totals = _calcTotals(x.items);                                           // tính tổng của phiếu
        const canEdit = String(x.grnStatus || '').toLowerCase() === 'pending';        // chỉ pending mới được sửa/duyệt/hủy

        return `
            <tr>
                <td>${((_grnPageNumber - 1) * _grnPageSize) + idx + 1}</td>            <!-- STT -->
                <td>
                    <div class="code" title="${_escapeHtml(x.id)}">${_escapeHtml(_shortId(x.id))}</div>
                </td>
                <td>${_escapeHtml(supplierName)}</td>                                  <!-- Supplier -->
                <td><span class="badge ${statusClass}">${_escapeHtml(statusText)}</span></td> <!-- Trạng thái -->
                <td>${totals.lines}</td>                                               <!-- Số dòng -->
                <td>${totals.qty}</td>                                                 <!-- Tổng số lượng -->
                <td>${_fmtMoney(totals.amount)}</td>                                   <!-- Tổng tiền -->
                <td>${_escapeHtml(_fmtDate(x.updatedAt))}</td>                         <!-- UpdatedAt -->
                <td>
                    <div class="row-actions">
                        <button class="btn" type="button" onclick="grnOpenView('${x.id}')">Xem</button>
                        ${canEdit ? `<button class="btn" type="button" onclick="grnOpenEdit('${x.id}')">Sửa</button>` : ''}
                        ${canEdit ? `<button class="btn" type="button" onclick="grnAskComplete('${x.id}')">Duyệt</button>` : ''}
                        ${canEdit ? `<button class="btn" type="button" onclick="grnAskCancel('${x.id}')">Hủy</button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// escape text để tránh lỗi HTML khi dữ liệu có ký tự đặc biệt
function _escapeHtml(s) {
    return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

// các hàm phân trang 
function _renderGrnPager() {
    const info = document.getElementById('grnPagerInfo');
    const prevBtn = document.getElementById('grnPrevBtn');
    const nextBtn = document.getElementById('grnNextBtn');

    if (info) {
        const from = _grnTotalCount === 0 ? 0 : ((_grnPageNumber - 1) * _grnPageSize) + 1;
        const to = Math.min(_grnPageNumber * _grnPageSize, _grnTotalCount);
        info.textContent = `Trang ${_grnPageNumber} / ${_grnTotalPages} • ${from}-${to} / ${_grnTotalCount}`;
    }

    if (prevBtn) prevBtn.disabled = _grnPageNumber <= 1;
    if (nextBtn) nextBtn.disabled = _grnPageNumber >= _grnTotalPages;
}

function grnPrevPage() {
    if (_grnPageNumber <= 1) return;
    _grnPageNumber--;
    grnLoad(false);
}

function grnNextPage() {
    if (_grnPageNumber >= _grnTotalPages) return;
    _grnPageNumber++;
    grnLoad(false);
}