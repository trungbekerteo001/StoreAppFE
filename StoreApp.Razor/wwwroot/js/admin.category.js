let _catMode = 'create';                // 'create' hoặc 'edit'
let _catEditId = null;                  // id đang sửa
let _catCache = [];                     // giữ danh sách category [{id,name}] để render lại sau khi sửa/xoá mà không cần gọi lại API

const CAT_API = '/api/category';        // khai báo route API category

// mỗi lần catLoad sẽ refresh table
async function catLoad(clearMsg = true) {       // lần đầu gọi thì clearMsg = true để clear msg nếu không khi đổi form nó mang msg theo 
    if (clearMsg) showMsg('catMsg', '');

    const kw = document.getElementById('kw')?.value?.trim() || '';      // lấy keyword từ ô search
    const qs = kw ? `?Keyword=${encodeURIComponent(kw)}` : '';          // tạo query string ?keyword=abc 

    const tb = document.getElementById('catTbody');                     // set Tbody thành "Đang tải..." trong lúc chờ API lấy data
    if (tb) tb.innerHTML = `<tr><td colspan="3" class="muted">Đang tải...</td></tr>`;

    const result = await apiRequest('GET', `${CAT_API}${qs}`);          // gọi API 

    if (!result.res) {    // nếu không có response (như lỗi mạng)
        showMsg('catMsg', result.raw || 'Không gọi được API.', 'error');
        if (tb) tb.innerHTML = `<tr><td colspan="3" class="muted">Lỗi tải dữ liệu.</td></tr>`;   // báo lỗi ra Tbody
        return;
    }

    if (!result.res.ok) { // API tre về lỗi (như 400, 500)
        showMsg('catMsg', result.data?.detail || result.data?.message || result.raw || `HTTP ${result.res.status}`, 'error');
        if (tb) tb.innerHTML = `<tr><td colspan="3" class="muted">Lỗi tải dữ liệu.</td></tr>`;
        return;
    }

    const items = Array.isArray(result.data) ? result.data : [];
    _catCache = items.map(x => ({ id: x.id, name: x.name }));
    _renderRows(_catCache);
}

// Auto load khi mở trang 
document.addEventListener('DOMContentLoaded', catLoad);

function catSearch() {
    catLoad();  // catLoad đã có sẵn logic lấy keyword từ ô search nên chỉ cần gọi lại là được
}

function catClear() {
    const kw = document.getElementById('kw');
    if (kw) kw.value = '';
    catLoad();
}

// Flow thêm category
function catOpenCreate() {
    _catMode = 'create';
    _catEditId = null;

    const title = document.getElementById('catModalTitle');
    if (title) title.textContent = 'Thêm Category';      // set title modal tuỳ theo mode

    const name = document.getElementById('catName');
    if (name) name.value = '';      // clear ô input trước khi mở modal

    showMsg('catModalMsg', '');    // clear msg trong modal trước khi mở modal
    catOpenModal();                 // mở modal
}

// Flow sửa category
function catOpenEdit(id) {
    const item = _catCache.find(x => String(x.id).toLowerCase() === String(id).toLowerCase());  // tìm item trong cache theo id 
    if (!item) {
        showMsg('catMsg', 'Không tìm thấy category cần sửa.', 'error');
        return;
    }

    _catMode = 'edit';
    _catEditId = item.id;

    const title = document.getElementById('catModalTitle');
    if (title) title.textContent = 'Sửa Category';      // set title modal tuỳ theo mode

    const name = document.getElementById('catName');    // set value ô input theo item cần sửa
    if (name) name.value = item.name || '';             // nếu item.name là null hoặc undefined thì set thành chuỗi rỗng để tránh lỗi

    showMsg('catModalMsg', '');        // clear msg trong modal trước khi mở modal
    catOpenModal();                     // mở modal
}

// Hàm mở modal, dùng chung cho cả create và edit
function catOpenModal() {
    const m = document.getElementById('catModal');      // trỏ đến modal
    if (m) m.classList.add('show');                     // display model 
    const input = document.getElementById('catName');   // lấy ô input trong modal để focus
    setTimeout(() => input?.focus(), 0);                // đưa con trỏ (focus) vào ô nhập liệu ngay sau khi mở modal
}

// Hàm đóng modal, dùng chung cho cả create và edit
function catCloseModal() {
    const m = document.getElementById('catModal');
    if (m) m.classList.remove('show');
}
// ESC để đóng
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') catCloseModal();
});

// Hàm lưu category, dùng chung cho cả create và edit
async function catSave() {
    const name = document.getElementById('catName')?.value?.trim() || '';   // lấy value từ ô input trong modal và trim khoảng trắng
    if (!name) {
        showMsg('catModalMsg', 'Tên không được rỗng.', 'error');           // Validate client: nếu rỗng → báo lỗi modal, stop
        return;
    }

    const btn = document.getElementById('catSaveBtn');                      // disable nút Save để đánh bấm nhiều lần trong khi chờ API phản hồi
    if (btn) { btn.disabled = true; btn.textContent = 'Đang lưu...'; }      // đổi text nút thành "Đang lưu..." để có feedback cho người dùng

    showMsg('catModalMsg', '');                // clear msg trong modal trước khi gọi API

    let result;
    if (_catMode === 'edit' && _catEditId) {      // gọi api khác nhau tùy theo mode 
        result = await apiRequest('PUT', `${CAT_API}/${_catEditId}`, { name });
    } else {
        result = await apiRequest('POST', `${CAT_API}`, { name });
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Lưu'; }              // enable lại nút Save sau khi có phản hồi từ API và đổi text nút về "Lưu"  

    if (!result.res) {      // nếu không có response 
        showMsg('catModalMsg', result.raw || 'Không gọi được API.', 'error');
        return;
    }

    if (!result.res.ok) {
        // nếu API trả về lỗi (như 400, 500)
        if (result.data && result.data.errors) {  // nếu có lỗi từ model validation)
            const errors = Object.values(result.data.errors).flat();   // lấy tất cả lỗi vào 1 mảng
            showMsg('catModalMsg', errors.join('\n'), 'error');        // hiển thị tất cả lỗi trong modal, cách nhau bởi dấu cách
        } else(result.data && result.data.detail) {
            showMsg('catModalMsg', result.data.detail, 'error');        // nếu có lỗi chi tiết thì hiển thị lỗi chi tiết trong modal
        }
        return;
    }

    catCloseModal();        // đóng modal sau khi lưu thành công
    await catLoad(false);
    showMsg('catMsg', _catMode === 'create' ? 'Tạo danh mục thành công.' : 'Cập nhật danh mục thành công.', 'success');
    setTimeout(() => showMsg('catMsg', ''), 1800);
}

// Hàm hỏi trước khi xoá category
function catAskDelete(id) {
    const item = _catCache.find(x => String(x.id).toLowerCase() === String(id).toLowerCase());  // tìm item trong cache theo id 
    const label = item?.name ? `"${item.name}"` : 'category này';
    if (!confirm(`Xoá ${label}?`)) return;
    catDelete(id);      // confirm xóa 
}

async function catDelete(id) {
    showMsg('catMsg', 'Đang xoá...');

    const result = await apiRequest('DELETE', `${CAT_API}/${id}`);   // gọi API xoá

    if (!result.res) {    // nếu không có response
        showMsg('catMsg', result.raw || 'Không gọi được API.', 'error');
        return;
    }

    if (!result.res.ok) {   // nếu API trả về lỗi (như 400, 500)
        showMsg('catMsg', result.data?.detail || result.data?.message || result.raw || `HTTP ${result.res.status}`, 'error');
        return;
    }

    await catLoad(false);
    showMsg('catMsg', 'Xóa danh mục thành công.', 'success');
    setTimeout(() => showMsg('catMsg', ''), 1800);
}

// hàm render table 
function _renderRows(items) {
    const tb = document.getElementById('catTbody');     // trỏ đến tbody của table
    if (!tb) return;

    if (!items || items.length === 0) {
        tb.innerHTML = `<tr><td colspan="3" class="muted">Không có dữ liệu.</td></tr>`;     // table body rỗng 
        return;
    }

    tb.innerHTML = items.map((x, idx) => {
        const id = x.id;
        const name = x.name ?? '';
        return `
            <tr>
                <td>${idx + 1}</td>
                <td>${_escapeHtml(name)}</td>
                <td>
                    <div class="row-actions">
                        <button class="btn" type="button" onclick="catOpenEdit('${id}')">Sửa</button>
                        <button class="btn danger" type="button" onclick="catAskDelete('${id}')">Xoá</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');            // chèn row data vào table
}

// // Hàm này tránh báo lỗi các name như "Điện thoại & máy tính"
function _escapeHtml(s) {
    return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}