'use strict';
(function () {
  const A = {};
  A.get = async function (url) {
    const res = await fetch(url, { headers: { 'X-Requested-With': 'fetch' } });
    const j = await res.json().catch(() => ({ ok: false, error: '响应解析失败' }));
    if (!j.ok) throw new Error(j.error || ('请求失败 ' + res.status));
    return j;
  };
  A.post = async function (url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify(body || {}),
    });
    const j = await res.json().catch(() => ({ ok: false, error: '响应解析失败' }));
    if (!j.ok) throw new Error(j.error || ('请求失败 ' + res.status));
    return j;
  };
  A.put = async function (url, body) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify(body || {}),
    });
    const j = await res.json().catch(() => ({ ok: false, error: '响应解析失败' }));
    if (!j.ok) throw new Error(j.error || ('请求失败 ' + res.status));
    return j;
  };
  A.del = async function (url) {
    const res = await fetch(url, { method: 'DELETE', headers: { 'X-Requested-With': 'fetch' } });
    const j = await res.json().catch(() => ({ ok: false, error: '响应解析失败' }));
    if (!j.ok) throw new Error(j.error || ('请求失败 ' + res.status));
    return j;
  };
  // multipart: FormData
  A.sendForm = async function (url, formData, method, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method || 'POST', url, true);
      xhr.setRequestHeader('X-Requested-With', 'fetch');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let j;
        try {
          j = JSON.parse(xhr.responseText);
        } catch (e) {
          return reject(new Error('响应解析失败'));
        }
        if (xhr.status >= 200 && xhr.status < 300 && j.ok) resolve(j);
        else reject(new Error(j && j.error ? j.error : '请求失败'));
      };
      xhr.onerror = () => reject(new Error('网络错误'));
      xhr.send(formData);
    });
  };
  window.API = A;
})();
