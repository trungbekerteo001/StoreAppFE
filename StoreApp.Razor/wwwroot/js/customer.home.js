const CUSTOMER_PRODUCT_API = '/api/product';    // route API product cho customer
const CUSTOMER_CATEGORY_API = '/api/category';  // route API category cho customer (nếu cần load category để filter hoặc hiển thị tên category)
const CUSTOMER_SUPPLIER_API = '/api/supplier';  // route API supplier cho customer (nếu cần load supplier để filter hoặc hiển thị tên supplier)

let _cusPageNumber = 1;                        // trang hiện tại
let _cusPageSize = 8;                          // số sản phẩm mỗi trang
let _cusTotalPages = 1;                        // tổng số trang (đọc từ header X-Pagination), khai báo = 1 để tránh lỗi khi chưa load dữ liệu nhưng vẫn render pager
let _cusProducts = [];                         // cache danh sách sản phẩm của trang hiện tại
let _cusCurrentProduct = null;                 // sản phẩm đang xem chi tiết trong modal

let _cusCategoryCache = [];                     // cache tạm danh sách category 
let _cusSupplierCache = [];                     // cache tạm danh sách supplier 

// load khi vào trang
document.addEventListener('DOMContentLoaded', async () => {
    await cusLoadLookups();    // load category + supplier trước
    await cusLoadProducts();   // rồi load product
});

async function cusLoadLookups() {   // load categoryName và supplierName cho modal chi tiết sp và filter 
    const catResult = await apiRequest('GET', `${CUSTOMER_CATEGORY_API}?PageNumber=1&PageSize=100`);    // lấy 100 cho hết, hoặc 1000 cho chắc 
    if (catResult.res && catResult.res.ok && Array.isArray(catResult.data)) {   // có response + response 200 + đúng kiểu trả về 
        _cusCategoryCache = catResult.data;
    } else {
        _cusCategoryCache = [];
    }

    const supResult = await apiRequest('GET', `${CUSTOMER_SUPPLIER_API}?PageNumber=1&PageSize=100`);    // ghép thành request 
    if (supResult.res && supResult.res.ok && Array.isArray(supResult.data)) {   // có response + response 200 + đúng kiểu trả về 
        _cusSupplierCache = supResult.data;
    } else {
        _cusSupplierCache = [];
    }
}

function _cusCategoryName(id) {
    const item = _cusCategoryCache.find(x => x.id === id);      // tìm id truyền vào với id trong cache
    if (item) return item.name;                                 // ok return name của id
    return '';
}

function _cusSupplierName(id) {
    const item = _cusSupplierCache.find(x => x.id === id);      // tìm id truyền vào với id trong cache
    if (item) return item.name;                                 // ok return name của id 
    return '';
}

// Load danh sách product có phân trang
// API gọi dạng: GET /api/Product?PageNumber=1&PageSize=8&Keyword=abc
async function cusLoadProducts() {
    showMsg('cusMsg', '');                     // clear message ngoài trang

    const grid = document.getElementById('productGrid');  // vùng hiển thị grid sản phẩm
    if (grid) {
        grid.innerHTML = `<div class="empty-box">Đang tải sản phẩm...</div>`; // trạng thái loading
    }

    const keyword = document.getElementById('prdKeyword')?.value?.trim() || ''; // lấy keyword search

    const qs = new URLSearchParams();          // build query string
    qs.set('PageNumber', String(_cusPageNumber));
    qs.set('PageSize', String(_cusPageSize));
    if (keyword) qs.set('Keyword', keyword);

    const result = await apiRequest('GET', `${CUSTOMER_PRODUCT_API}?${qs.toString()}`); // gọi API list product

    if (!result.res) {                         // lỗi không có response (mạng / CORS / server không chạy)
        showMsg('cusMsg', result.raw || 'Không gọi được API sản phẩm.', 'error');
        if (grid) grid.innerHTML = `<div class="empty-box">Lỗi tải dữ liệu.</div>`;
        return;
    }

    if (!result.res.ok) {                      // API trả lỗi HTTP (400 / 401 / 500...)
        showMsg('cusMsg', result.data?.detail || result.data?.message || result.raw || `HTTP ${result.res.status}`, 'error');
        if (grid) grid.innerHTML = `<div class="empty-box">Lỗi tải dữ liệu.</div>`;
        return;
    }

    const arr = Array.isArray(result.data) ? result.data : []; // dữ liệu list product
    _cusProducts = arr;                                        // cache lại để render

    // đọc metadata phân trang từ header X-Pagination
    // ví dụ BE trả: { CurrentPage: 1, TotalPages: 5, ... }
    const paginationRaw = result.res.headers.get('X-Pagination');
    if (paginationRaw) {
        try {
            const meta = JSON.parse(paginationRaw);
            _cusTotalPages = Number(meta.TotalPages || 1);         // tổng số trang
            _cusPageNumber = Number(meta.CurrentPage || _cusPageNumber); // đồng bộ lại trang hiện tại
        } catch {
            _cusTotalPages = 1;                                    // nếu parse lỗi thì fallback = 1
        }
    } else {
        _cusTotalPages = 1;                                        // nếu BE không trả header thì coi như 1 trang
    }

    cusRenderProducts();                   // render grid sản phẩm
    cusRenderPager();                      // render thông tin phân trang
}

// Render danh sách sản phẩm ra grid card
function cusRenderProducts() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;

    if (!_cusProducts.length) {            // không có dữ liệu
        grid.innerHTML = `<div class="empty-box">Không có sản phẩm nào.</div>`;
        return;
    }

    grid.innerHTML = _cusProducts.map(p => `
    <div class="product-card" onclick="cusOpenDetail('${_escapeAttr(p.id)}')">
        <div class="product-thumb-wrap">
            ${p.imageUrl
            ? `<img class="product-thumb" src="${_escapeAttr(p.imageUrl)}" alt="${_escapeAttr(p.productName || '')}" />`
            : `<div class="product-thumb placeholder">No image</div>`
        }
        </div>

        <div class="product-body">
            <h3 class="product-name">${_escapeHtml(p.productName || '')}</h3>
            <div class="product-price">${cusMoney(p.price)}</div>

            <div class="card-actions">
                <button class="card-btn secondary" type="button"
                        onclick="event.stopPropagation(); cusAddToCartFromList('${_escapeAttr(p.id)}')">
                    Thêm vào giỏ hàng
                </button>

                <button class="card-btn" type="button"
                        onclick="event.stopPropagation(); cusOpenDetail('${_escapeAttr(p.id)}')">
                    Xem chi tiết
                </button>
            </div>
        </div>
    </div>
    `).join('');
    // click vào card => mở modal chi tiết
    // click nút "Xem chi tiết" => cũng mở modal, nhưng stopPropagation để tránh click đè lên card cha
}

// Render thanh phân trang đơn giản: Trang x / y + disable nút prev/next
function cusRenderPager() {
    const pager = document.getElementById('pager');
    const pagerInfo = document.getElementById('pagerInfo');
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');

    if (!pager || !pagerInfo || !btnPrev || !btnNext) return;

    pager.style.display = 'flex';                                  // hiện vùng pager
    pagerInfo.textContent = `Trang ${_cusPageNumber} / ${_cusTotalPages}`;

    btnPrev.disabled = _cusPageNumber <= 1;                        // trang đầu => disable Prev
    btnNext.disabled = _cusPageNumber >= _cusTotalPages;           // trang cuối => disable Next
}

// Chuyển về trang trước
function cusPrevPage() {
    if (_cusPageNumber <= 1) return;       // đang ở trang đầu thì không làm gì
    _cusPageNumber--;
    cusLoadProducts();                     // load lại dữ liệu theo trang mới
}

// Chuyển sang trang sau
function cusNextPage() {
    if (_cusPageNumber >= _cusTotalPages) return;  // đang ở trang cuối thì không làm gì
    _cusPageNumber++;
    cusLoadProducts();                             // load lại dữ liệu theo trang mới
}

// Reload danh sách theo keyword mới
// dùng khi bấm nút tìm kiếm hoặc Enter trong ô search
function cusReloadProducts() {
    _cusPageNumber = 1;                    // search mới thì quay về trang 1
    cusLoadProducts();
}

// Mở modal chi tiết product
// API gọi: GET /api/Product/{id}
async function cusOpenDetail(id) {
    const modal = document.getElementById('productDetailModal');   // modal chi tiết
    const body = document.getElementById('productDetailBody');     // vùng body trong modal

    if (!modal || !body) return;

    modal.classList.add('show');                                   // mở modal ngay
    body.innerHTML = `<div class="empty-box">Đang tải chi tiết...</div>`; // loading
    showMsg('detailMsg', '');                                      // clear message trong modal

    const result = await apiRequest('GET', `${CUSTOMER_PRODUCT_API}/${encodeURIComponent(id)}`); // gọi API chi tiết

    if (!result.res) {                                             // lỗi không gọi được API
        body.innerHTML = `<div class="empty-box">Không gọi được API chi tiết sản phẩm.</div>`;
        return;
    }

    if (!result.res.ok) {                                          // API lỗi HTTP
        body.innerHTML = `<div class="empty-box">Không tải được chi tiết sản phẩm.</div>`;
        return;
    }

    const p = result.data;                                         // object product chi tiết
    _cusCurrentProduct = p;                                        // lưu state sản phẩm hiện tại để add cart

    const categoryName = _cusCategoryName(p.categoryId) || 'Không rõ';  // lấy tên category từ cache để gọi bên dưới 
    const supplierName = _cusSupplierName(p.supplierId) || 'Không rõ';  // lấy tên supplier từ cache để gọi bên dưới 

    body.innerHTML = `
    <div class="detail-layout">
        <div class="detail-image-wrap">
            ${p.imageUrl
            ? `<img class="detail-image" src="${_escapeAttr(p.imageUrl)}" alt="${_escapeAttr(p.productName || '')}" />`
            : `<div class="detail-image placeholder">No image</div>`
        }
        </div>

        <div class="detail-content">
            <h3 class="detail-name">${_escapeHtml(p.productName || '')}</h3>
            <div class="detail-price">${cusMoney(p.price)}</div>

            <div class="detail-meta">
                <div><strong>Danh mục:</strong> ${_escapeHtml(categoryName)}</div>
                <div><strong>Nhà cung cấp:</strong> ${_escapeHtml(supplierName)}</div>
            </div>
        </div>
    </div>
`;
}

// Đóng modal chi tiết
function cusCloseDetailModal() {
    const modal = document.getElementById('productDetailModal');
    if (modal) modal.classList.remove('show');
}

// Thêm sản phẩm đang xem vào giỏ hàng
// Hiện tại giỏ hàng lưu ở localStorage
function cusAddCurrentToCart() {
    if (!_cusCurrentProduct) {                                     // chưa có sản phẩm đang xem
        showMsg('detailMsg', 'Không có sản phẩm để thêm.', 'error');
        return;
    }

    const key = 'customer_cart';                                   // key localStorage của giỏ hàng
    const raw = localStorage.getItem(key);
    let cart = [];

    try {
        cart = raw ? JSON.parse(raw) : [];                         // parse dữ liệu cũ
        if (!Array.isArray(cart)) cart = [];                       // nếu không phải array thì reset
    } catch {
        cart = [];                                                 // JSON lỗi => reset cart
    }

    // tìm xem sản phẩm đã có trong giỏ chưa
    const found = cart.find(x => String(x.productId).toLowerCase() === String(_cusCurrentProduct.id).toLowerCase());

    if (found) {    
        showMsg('detailMsg', 'Sản phẩm đã có trong giỏ hàng.', 'warn');
        return;
    }

    cart.push({         // chưa có trong cart thì thêm mới vào cart, số lượng mặc định = 1
        productId: _cusCurrentProduct.id,
        productName: _cusCurrentProduct.productName,
        price: _cusCurrentProduct.price,
        imageUrl: _cusCurrentProduct.imageUrl || '',
        quantity: 1
    });

    localStorage.setItem(key, JSON.stringify(cart));               // lưu lại giỏ hàng
    showMsg('detailMsg', 'Đã thêm vào giỏ hàng.', 'success');
}

function cusAddToCartFromList(id) {     
    const product = _cusProducts.find(x => x.id === id);
    if (!product) {
        showMsg('cusMsg', 'Không tìm thấy sản phẩm.', 'error');
        setTimeout(() => showMsg('cusMsg', ''), 1800);
        return;
    }

    const key = 'customer_cart';
    const raw = localStorage.getItem(key);
    let cart = [];

    try {
        cart = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(cart)) cart = [];
    } catch {
        cart = [];
    }

    const found = cart.find(x => x.productId === product.id);

    if (found) {
        showMsg('cusMsg', 'Sản phẩm đã có trong giỏ hàng.', 'warn');
        setTimeout(() => showMsg('cusMsg', ''), 1800);
        return;
    }

    cart.push({
        productId: product.id,
        productName: product.productName,
        price: product.price,
        imageUrl: product.imageUrl || '',
        quantity: 1
    });

    localStorage.setItem(key, JSON.stringify(cart));
    showMsg('cusMsg', 'Đã thêm vào giỏ hàng.', 'success');
    setTimeout(() => showMsg('cusMsg', ''), 1800);
}

// Format tiền kiểu Việt Nam
// ví dụ: 120000 => 120.000 đ
function cusMoney(v) {
    const n = Number(v || 0);
    return n.toLocaleString('vi-VN') + ' đ';
}

// escape text để tránh lỗi HTML / XSS cơ bản khi render text ra giao diện
function _escapeHtml(s) {
    return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

// escape cho attribute html như src="", alt="", onclick=""
function _escapeAttr(s) {
    return _escapeHtml(s);
}

// ESC để đóng modal chi tiết
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cusCloseDetailModal();
});

// Enter trong ô search để tìm kiếm
document.addEventListener('DOMContentLoaded', () => {
    const kw = document.getElementById('prdKeyword');
    if (kw) {
        kw.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();        // chặn submit mặc định
                cusReloadProducts();       // search lại từ trang 1
            }
        });
    }
});