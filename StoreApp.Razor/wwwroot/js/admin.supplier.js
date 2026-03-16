let _supMode = 'create';   // 'create' | 'edit'
let _supEditId = null;     // id đang sửa
let _supCache = [];        // giữ danh sách supplier [{id,name,phone,email,address}] để render lại sau khi sửa/xoá mà không cần gọi lại API

const SUP_API = '/api/Supplier'; // khai báo route API supplier

// mỗi lần supLoad sẽ refresh table
async function supLoad(clearMsg = true) {       // lần đầu gọi thì clearMsg = true để clear msg nếu không khi đổi form nó kéo msg theo
    if (clearMsg) showMsg('supMsg', '');

    const kw = document.getElementById('kw')?.value?.trim() || '';      // lấy keyword từ ô search
    const qs = kw ? `?Keyword=${encodeURIComponent(kw)}` : '';          // tạo query string ?keyword=abc 

    const tb = document.getElementById('supTbody');                     // set Tbody thành "Đang tải..." trong lúc chờ API lấy data
    if (tb) tb.innerHTML = `<tr><td colspan="6" class="muted">Đang tải...</td></tr>`;

    const result = await apiRequest('GET', `${SUP_API}${qs}`);          // gọi API 

    if (!result.res) {    // nếu không có response (như lỗi mạng)
        showMsg('supMsg', result.raw || 'Không gọi được API.', 'error');
        if (tb) tb.innerHTML = `<tr><td colspan="6" class="muted">Lỗi tải dữ liệu.</td></tr>`;   // báo lỗi ra Tbody
        return;
    }

    if (!result.res.ok) { // API tre về lỗi (như 400, 500)
        showMsg('supMsg', getApiErrorText(result), 'error');
        if (tb) tb.innerHTML = `<tr><td colspan="6" class="muted">Lỗi tải dữ liệu.</td></tr>`;
        return;
    }

    const arr = Array.isArray(result.data) ? result.data : [];
    _supCache = Array.isArray(arr) ? arr : [];                                          // giữ nguyên dữ liệu camelCase từ BE
    _renderSupRows(_supCache);                                                          // render table 
}

// Auto load khi mở trang 
document.addEventListener('DOMContentLoaded', supLoad);

function supSearch() {
    supLoad();  // supLoad đã có sẵn logic lấy keyword từ ô search nên chỉ cần gọi lại là được
}

function supClear() {
    const kw = document.getElementById('kw');
    if (kw) kw.value = '';
    supLoad();
}

// helper lấy giá trị input theo id, trim khoảng trắng
function _getVal(id) {
    return document.getElementById(id)?.value?.trim() || '';
}

// helper set giá trị input theo id
function _setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
}

// Flow thêm supplier
function supOpenCreate() {
    _supMode = 'create';
    _supEditId = null;

    const title = document.getElementById('supModalTitle');
    if (title) title.textContent = 'Thêm Supplier';      // set title modal tuỳ theo mode

    _setVal('supName', '');       // clear ô input trước khi mở modal
    _setVal('supPhone', '');
    _setVal('supEmail', '');
    _setVal('supAddress', '');

    showMsg('supModalMsg', '');   // clear msg trong modal trước khi mở modal
    supOpenModal();               // mở modal
}

// Flow sửa supplier
function supOpenEdit(id) {
    const item = _supCache.find(x => String(x.id).toLowerCase() === String(id).toLowerCase());  // tìm item trong cache theo id 
    if (!item) {
        showMsg('supMsg', 'Không tìm thấy supplier cần sửa.', 'error');
        return;
    }

    _supMode = 'edit';
    _supEditId = item.id;

    const title = document.getElementById('supModalTitle');
    if (title) title.textContent = 'Sửa Supplier';      // set title modal tuỳ theo mode

    _setVal('supName', item.name || '');          // set value ô input theo item cần sửa
    _setVal('supPhone', item.phone || '');
    _setVal('supEmail', item.email || '');
    _setVal('supAddress', item.address || '');

    showMsg('supModalMsg', '');        // clear msg trong modal trước khi mở modal
    supOpenModal();                    // mở modal
}

// Hàm mở modal, dùng chung cho cả create và edit
function supOpenModal() {
    const m = document.getElementById('supModal');      // trỏ đến modal
    if (m) m.classList.add('show');                     // display modal 
    const input = document.getElementById('supName');   // lấy ô input trong modal để focus
    setTimeout(() => input?.focus(), 0);                // đưa con trỏ (focus) vào ô nhập liệu ngay sau khi mở modal
}

// Hàm đóng modal, dùng chung cho cả create và edit
function supCloseModal() {
    const m = document.getElementById('supModal');
    if (m) m.classList.remove('show');
}
// ESC để đóng
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') supCloseModal();
});


// Hàm lưu supplier, dùng chung cho cả create và edit
async function supSave() {
    const name = _getVal('supName');                     // lấy value từ ô input trong modal và trim khoảng trắng
    const phone = _getVal('supPhone');
    const email = _getVal('supEmail');
    const address = _getVal('supAddress');

    if (!name) {
        showMsg('supModalMsg', 'Tên nhà cung cấp không được rỗng.', 'error');  // Validate client: nếu rỗng → báo lỗi modal, stop
        return;
    }

    const btn = document.getElementById('supSaveBtn');                      // disable nút Save để đánh bấm nhiều lần trong khi chờ API phản hồi
    if (btn) { btn.disabled = true; btn.textContent = 'Đang lưu...'; }      // đổi text nút thành "Đang lưu..." để có feedback cho người dùng

    showMsg('supModalMsg', '');                // clear msg trong modal trước khi gọi API

    const body = { name, phone, email, address };                           // body gửi lên BE
    let result;

    if (_supMode === 'edit' && _supEditId) {      // gọi api khác nhau tùy theo mode 
        result = await apiRequest('PUT', `${SUP_API}/${encodeURIComponent(_supEditId)}`, body);
    } else {
        result = await apiRequest('POST', `${SUP_API}`, body);
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Lưu'; }             // enable lại nút Save sau khi có phản hồi từ API và đổi text nút về "Lưu"  

    if (!result.res) {      // nếu không có response 
        showMsg('supModalMsg', result.raw || 'Không gọi được API.', 'error');
        return;
    }

    if (!result.res.ok) {   // nếu API trả về lỗi (như 400, 500)
        showMsg('supModalMsg', getApiErrorText(result), 'error');
        return;
    }

    supCloseModal();        // đóng modal sau khi lưu thành công
    await supLoad(false);
    showMsg('supMsg', _supMode === 'create' ? 'Tạo supplier thành công.' : 'Cập nhật supplier thành công.', 'success');
    setTimeout(() => showMsg('supMsg', ''), 1800);
}

// Hàm hỏi trước khi xoá supplier
function supAskDelete(id) {
    const item = _supCache.find(x => String(x.id).toLowerCase() === String(id).toLowerCase());  // tìm item trong cache theo id 
    const label = item?.name ? `"${item.name}"` : 'supplier này';
    if (!confirm(`Xoá ${label}?`)) return;
    supDelete(id);      // confirm xóa 
}

async function supDelete(id) {
    showMsg('supMsg', 'Đang xoá...', 'warn');

    const result = await apiRequest('DELETE', `${SUP_API}/${encodeURIComponent(id)}`);   // gọi API xoá

    if (!result.res) {    // nếu không có response
        showMsg('supMsg', result.raw || 'Không gọi được API.', 'error');
        return;
    }

    if (!result.res.ok) {   // nếu API trả về lỗi (như 400, 500)
        showMsg('supMsg', getApiErrorText(result), 'error');
        return;
    }

    await supLoad(false);
    showMsg('supMsg', 'Xóa supplier thành công.', 'success');
    setTimeout(() => showMsg('supMsg', ''), 1800);
}

// hàm render table 
function _renderSupRows(items) {
    const tb = document.getElementById('supTbody');     // trỏ đến tbody của table
    if (!tb) return;

    if (!items || items.length === 0) {
        tb.innerHTML = `<tr><td colspan="6" class="muted">Không có dữ liệu.</td></tr>`;     // table body rỗng 
        return;
    }

    tb.innerHTML = items.map((x, idx) => {
        const id = x.id;
        const name = x.name ?? '';
        const phone = x.phone ?? '';
        const email = x.email ?? '';
        const address = x.address ?? '';

        return `
            <tr>
                <td>${idx + 1}</td>
                <td>${_escapeHtml(name)}</td>
                <td>${_escapeHtml(phone || '—')}</td>
                <td>${_escapeHtml(email || '—')}</td>
                <td>${_escapeHtml(address || '—')}</td>
                <td>
                    <div class="row-actions">
                        <button class="btn" type="button" onclick="supOpenEdit('${id}')">Sửa</button>
                        <button class="btn danger" type="button" onclick="supAskDelete('${id}')">Xoá</button>
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