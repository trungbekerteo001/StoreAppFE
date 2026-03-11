let _usrMode = 'create';   // 'create' | 'edit'
let _usrEditId = null;     // id đang sửa
let _usrCache = [];        // giữ danh sách user [{id,username,fullName,phone,role,roleRaw}] để render lại sau khi sửa/xoá mà không cần gọi lại API

let _usrPageNumber = 1;    // trang hiện tại
let _usrPageSize = 10;     // số dòng / trang
let _usrTotalPages = 1;    // tổng số trang
let _usrTotalCount = 0;    // tổng số bản ghi

const USR_API = '/api/user'; // khai báo route API user

// Auto load khi mở trang
document.addEventListener('DOMContentLoaded', usrLoad);

// mỗi lần usrLoad sẽ refresh table
async function usrLoad(clearMsg = true) {       // lần đầu gọi thì clearMsg = true để clear msg nếu không khi đổi form nó kéo msg theo
    if (clearMsg) showMsg('usrMsg', '');

    const kw = document.getElementById('kw')?.value?.trim() || '';      // lấy keyword từ ô search
    const qs = new URLSearchParams();
    qs.set('PageNumber', String(_usrPageNumber));
    qs.set('PageSize', String(_usrPageSize));
    if (kw) qs.set('Keyword', kw);                                      // tạo query string ?keyword=abc 

    const tb = document.getElementById('usrTbody');                     // set Tbody thành "Đang tải..." trong lúc chờ API lấy data
    if (tb) tb.innerHTML = `<tr><td colspan="6" class="muted">Đang tải...</td></tr>`;

    const result = await apiRequest('GET', `${USR_API}${qs.toString() ? ('?' + qs.toString()) : ''}`);          // gọi API 

    if (!result.res) {    // nếu không có response (như lỗi mạng)
        showMsg('usrMsg', result.raw || 'Không gọi được API.', 'error');
        if (tb) tb.innerHTML = `<tr><td colspan="6" class="muted">Lỗi tải dữ liệu.</td></tr>`;   // báo lỗi ra Tbody
        return;
    }

    if (!result.res.ok) { // API trả về lỗi (như 400, 500)
        showMsg('usrMsg',
            result.data?.detail || result.data?.message || result.raw || `HTTP ${result.res.status}`,
            'error'
        );
        if (tb) tb.innerHTML = `<tr><td colspan="6" class="muted">Lỗi tải dữ liệu.</td></tr>`;
        return;
    }

    const arr = Array.isArray(result.data) ? result.data : [];
    _usrCache = Array.isArray(arr) ? arr : [];                                          // giữ nguyên dữ liệu camelCase từ BE

    const paginationRaw = result.res.headers.get('X-Pagination');
    if (paginationRaw) {
        try {
            const meta = JSON.parse(paginationRaw);
            _usrTotalPages = Math.max(1, Number(meta.TotalPages || 1));
            _usrPageNumber = Math.max(1, Number(meta.CurrentPage || _usrPageNumber));
            _usrTotalCount = Math.max(0, Number(meta.TotalCount || 0));
        } catch {
            _usrTotalPages = 1;
            _usrTotalCount = _usrCache.length;
        }
    } else {
        _usrTotalPages = 1;
        _usrTotalCount = _usrCache.length;
    }

    _renderUsrRows(_usrCache);                                                          // render table    
    _renderUsrPager();
}

function usrSearch() {
    _usrPageNumber = 1;
    usrLoad();  // usrLoad đã có sẵn logic lấy keyword từ ô search nên chỉ cần gọi lại là được
}

function usrClear() {
    const kw = document.getElementById('kw');
    if (kw) kw.value = '';
    _usrPageNumber = 1;
    usrLoad();
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

// Flow thêm user
function usrOpenCreate() {
    _usrMode = 'create';
    _usrEditId = null;

    const title = document.getElementById('usrModalTitle');
    const sub = document.getElementById('usrModalSub');
    if (title) title.textContent = 'Thêm User';      // set title modal tuỳ theo mode
    if (sub) sub.textContent = 'Tạo mới người dùng';

    _setVal('usrUserName', '');       // clear ô input trước khi mở modal
    _setVal('usrFullName', '');
    _setVal('usrPhone', '');
    _setVal('usrRole', 'Staff');     // default role là Staff khi tạo mới
    _setVal('usrPassword', '');

    const hint = document.getElementById('usrPwdHint'); // hint password chỉ hiện khi sửa
    if (hint) hint.style.display = 'none';

    showMsg('usrModalMsg', '');       // clear msg trong modal trước khi mở modal
    usrOpenModal();                   // mở modal
}

// Flow sửa user
function usrOpenEdit(id) {
    const item = _usrCache.find(x => x.id === id);
    if (!item) return;

    _usrMode = 'edit';
    _usrEditId = id;

    const title = document.getElementById('usrModalTitle');
    const sub = document.getElementById('usrModalSub');
    if (title) title.textContent = 'Sửa User';      // set title modal tuỳ theo mode
    if (sub) sub.textContent = `ID: ${id}`;

    const hint = document.getElementById('usrPwdHint'); // sửa: hiện hint để user biết có thể để trống nếu không đổi
    if (hint) hint.style.display = 'block';

    _setVal('usrUserName', item.username);          // set value ô input theo item cần sửa
    _setVal('usrFullName', item.fullName);
    _setVal('usrPhone', item.phone);
    _setVal('usrRole', item.role);  

    // Mật khẩu: để trống nếu không đổi
    _setVal('usrPassword', '');

    showMsg('usrModalMsg', '');        // clear msg trong modal trước khi mở modal
    usrOpenModal();                    // mở modal
}

// Hàm mở modal, dùng chung cho cả create và edit
function usrOpenModal() {
    const m = document.getElementById('usrModal');       // trỏ đến modal
    if (m) m.classList.add('show');                      // display modal 
    const input = document.getElementById('usrUserName'); // lấy ô input trong modal để focus
    setTimeout(() => input?.focus(), 0);                 // đưa con trỏ (focus) vào ô nhập liệu ngay sau khi mở modal
}

// Hàm đóng modal, dùng chung cho cả create và edit
function usrCloseModal() {
    const m = document.getElementById('usrModal');
    if (m) m.classList.remove('show');
}

// Hàm lưu user, dùng chung cho cả create và edit
async function usrSave() {
    const userName = _getVal('usrUserName');                     // lấy value từ ô input trong modal và trim khoảng trắng
    const fullName = _getVal('usrFullName');
    const phone = _getVal('usrPhone');
    const role = _getVal('usrRole') || 'Staff';
    const password = document.getElementById('usrPassword')?.value ?? ''; // password có thể rỗng khi sửa

    if (!userName) {
        showMsg('usrModalMsg', 'Username không được rỗng.', 'error');  // Validate client: nếu rỗng → báo lỗi modal, stop
        return;
    }
    if (!fullName) {
        showMsg('usrModalMsg', 'Họ tên không được rỗng.', 'error');
        return;
    }
    if (!phone) {
        showMsg('usrModalMsg', 'SĐT không được rỗng.', 'error');
        return;
    }

    // Tạo mới: bắt buộc password
    if (_usrMode === 'create' && !String(password).trim()) {
        showMsg('usrModalMsg', 'Mật khẩu không được rỗng khi tạo mới.', 'error');
        return;
    }

    const payload = { userName, fullName, phone, role };          // body gửi lên BE
    // Sửa: cho phép không đổi password
    if (String(password).trim()) payload.password = String(password);

    const btn = document.getElementById('usrSaveBtn');            // disable nút Save để tránh bấm nhiều lần trong khi chờ API phản hồi
    if (btn) btn.disabled = true;

    try {
        let result;

        if (_usrMode === 'create') {                              // gọi api khác nhau tuỳ theo mode
            result = await apiRequest('POST', USR_API, payload);
        } else {
            result = await apiRequest('PUT', `${USR_API}/${_usrEditId}`, payload);
        }

        if (!result.res) {      // nếu không có response 
            showMsg('usrModalMsg', result.raw || 'Không gọi được API.', 'error');
            return;
        }

        if (!result.res.ok) {   // nếu API trả về lỗi (như 400, 500)
            showMsg('usrModalMsg',
                result.data?.detail || result.data?.message || result.raw || `HTTP ${result.res.status}`,
                'error'
            );
            return;
        }

        usrCloseModal();        // đóng modal sau khi lưu thành công
        if (_usrMode === 'create') _usrPageNumber = 1;  // tạo mới xong quay về trang 1  
        await usrLoad(false);
        showMsg('usrMsg', _usrMode === 'create' ? 'Tạo user thành công.' : 'Cập nhật user thành công.', 'success');
        setTimeout(() => showMsg('usrMsg', ''), 1800);

    } finally {
        if (btn) btn.disabled = false;
    }
}

async function usrDelete(id) {
    const item = _usrCache.find(x => x.id === id);
    const name = item ? item.username : id;

    if (!confirm(`Xóa user "${name}" ?`)) return;

    const result = await apiRequest('DELETE', `${USR_API}/${id}`);   // gọi API xoá

    if (!result.res) {    // nếu không có response
        showMsg('usrMsg', result.raw || 'Không gọi được API.', 'error');
        return;
    }

    if (!result.res.ok) {   // nếu API trả về lỗi (như 400, 500)
        showMsg('usrMsg',
            result.data?.detail || result.data?.message || result.raw || `HTTP ${result.res.status}`,
            'error'
        );
        return;
    }

    // nếu xóa bản ghi cuối cùng của trang thì lùi 1 trang
    if (_usrCache.length === 1 && _usrPageNumber > 1) {
        _usrPageNumber--;
    }

    await usrLoad(false);
    showMsg('usrMsg', 'Xóa user thành công.', 'success');
    setTimeout(() => showMsg('usrMsg', ''), 1800);
}

// hàm render table 
function _renderUsrRows(items) {
    const tb = document.getElementById('usrTbody');     // trỏ đến tbody của table
    if (!tb) return;

    if (!items || items.length === 0) {
        tb.innerHTML = `<tr><td colspan="6" class="muted">Không có dữ liệu.</td></tr>`;     // table body rỗng 
        return;
    }

    tb.innerHTML = items.map((x, idx) => `
        <tr>
            <td>${idx + 1}</td>
            <td>
                <div class="cell-main">${_esc(x.username)}</div>
                <div class="cell-sub">${_esc(x.id)}</div>
            </td>
            <td>${_esc(x.fullName)}</td>
            <td>${_esc(x.phone)}</td>
            <td><span class="badge">${_esc(x.role)}</span></td>
            <td>
                <div class="actions">
                    <button class="btn" type="button" onclick="usrOpenEdit('${x.id}')">Sửa</button>
                    <button class="btn danger" type="button" onclick="usrDelete('${x.id}')">Xóa</button>
                </div>
            </td>
        </tr>
    `).join('');            // chèn row data vào table
}

// // Hàm này tránh báo lỗi các text như "A & B"
function _esc(s) {
    return String(s ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

// click ra ngoài modal để đóng
document.addEventListener('click', (e) => {
    const m = document.getElementById('usrModal');
    if (!m || !m.classList.contains('show')) return;

    if (e.target === m) usrCloseModal();
});

// ESC để đóng
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') usrCloseModal();
});

// render phân trang
function _renderUsrPager() {
    const info = document.getElementById('usrPagerInfo');
    const prevBtn = document.getElementById('usrPrevBtn');
    const nextBtn = document.getElementById('usrNextBtn');

    if (info) {
        const from = _usrTotalCount === 0 ? 0 : ((_usrPageNumber - 1) * _usrPageSize) + 1;
        const to = Math.min(_usrPageNumber * _usrPageSize, _usrTotalCount);
        info.textContent = `Trang ${_usrPageNumber} / ${_usrTotalPages} • ${from}-${to} / ${_usrTotalCount}`;
    }

    if (prevBtn) prevBtn.disabled = _usrPageNumber <= 1;
    if (nextBtn) nextBtn.disabled = _usrPageNumber >= _usrTotalPages;
}

function usrPrevPage() {
    if (_usrPageNumber <= 1) return;
    _usrPageNumber--;
    usrLoad(false);
}

function usrNextPage() {
    if (_usrPageNumber >= _usrTotalPages) return;
    _usrPageNumber++;
    usrLoad(false);
}