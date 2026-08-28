/** @type {import('../_venera_.js')} */
// Mangabz 漫画源 —— https://www.mangabz.com
// 繁体中文日本漫画大站，存量巨大（数万部），免费无需登录。
// 章节图片经 chapterimage.ashx 接口按页返回 JS 数组（带防盗链签名）。
class Mangabz extends ComicSource {
    name = "Mangabz"

    key = "mangabz"

    version = "1.0.0"

    minAppVersion = "1.6.0"

    url = ""

    get baseUrl() {
        return "https://www.mangabz.com";
    }

    _headers(extra) {
        return Object.assign({
            'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'accept-language': 'zh-TW,zh;q=0.9,en;q=0.8',
            'referer': this.baseUrl + '/',
        }, extra || {});
    }

    _abs(url) {
        if (!url) return '';
        url = url.trim();
        if (/^https?:/i.test(url)) return url;
        if (url.startsWith('//')) return 'https:' + url;
        return this.baseUrl + url;
    }

    // 从 <li> 条目容器解析漫画列表（分类页 / 搜索页 / 首页共用）
    _parseComics(html) {
        let comics = [];
        let doc = new HtmlDocument(html);
        let lis = doc.querySelectorAll('li');
        for (let i = 0; i < lis.length; i++) {
            let li = lis[i];
            let a = li.querySelector('a[href*="bz"]');
            if (!a) continue;
            let href = a.attributes['href'] || '';
            if (!/^\/\d+bz\/$/.test(href)) continue;
            let title = (a.attributes['title'] || '').trim();
            if (!title) {
                let h = li.querySelector('h3');
                if (h) title = h.text.trim();
            }
            if (!title) continue;
            let img = li.querySelector('img');
            let cover = img ? (img.attributes['data-src'] || img.attributes['src'] || '') : '';
            let desc = '';
            let latest = li.querySelector('a[href*="/m"]');
            if (latest && latest.text) desc = latest.text.trim();
            comics.push(new Comic({
                id: this._abs(href),
                title: title,
                cover: this._abs(cover),
                description: desc,
            }));
        }
        // 去重（按 id）
        let seen = {};
        let out = [];
        for (let c of comics) {
            if (seen[c.id]) continue;
            seen[c.id] = 1;
            out.push(c);
        }
        return out;
    }

    // 解析分页链接里的最大页码（支持 -p{n}/ 与 ?page={n} / &page={n} 两种格式）
    _parseMaxPage(html) {
        let max = 1;
        let re = /(?:-p(\d+)\/|[?&]page=(\d+))/g;
        let m;
        while ((m = re.exec(html)) !== null) {
            let n = parseInt(m[1] || m[2], 10);
            if (!isNaN(n) && n > max) max = n;
        }
        return max;
    }

    // explore page
    explore = [{
        title: "首页推荐",
        type: "multiPartPage",
        load: async (page) => {
            let res = await Network.get(this.baseUrl + '/', this._headers());
            if (res.status !== 200) throw `Invalid status code: ${res.status}`;
            let comics = this._parseComics(res.body || '');
            if (comics.length === 0) throw '解析首页失败，网站结构可能已变化';
            return [{ title: '热门推荐', comics: comics.slice(0, 20) }];
        },
    }]

    // categories
    category = {
        title: "Mangabz",
        parts: [{
            name: "题材",
            type: "fixed",
            itemType: "category",
            categories: [
                "全部", "热血", "恋爱", "校园", "冒险",
                "科幻", "生活", "悬疑", "魔法", "运动",
            ],
            categoryParams: [
                "0", "31", "26", "1", "2",
                "25", "11", "17", "15", "34",
            ],
        }],
        enableRankingPage: false,
    }

    categoryComics = {
        // options: [statusOption, sortOption]，option 值为 '-' 左侧
        load: async (category, param, options, page) => {
            let tag = param || '0';
            let statusOpt = (options && options[0]) ? options[0].split('-')[0] : '0';
            let sortOpt = (options && options[1]) ? options[1].split('-')[0] : '0';
            let path = `manga-list-${tag}-${statusOpt}-${sortOpt}`;
            if (page && page > 1) path += `-p${page}`;
            let url = `${this.baseUrl}/${path}/`;
            let res = await Network.get(url, this._headers());
            if (res.status !== 200) throw `加载分类失败: ${res.status}`;
            let html = res.body || '';
            let comics = this._parseComics(html);
            let maxPage = this._parseMaxPage(html);
            if (maxPage < (page || 1)) maxPage = page || 1;
            if (comics.length === 0) maxPage = page || 1;
            return { comics: comics, maxPage: maxPage };
        },
        optionList: [
            {
                type: 'select',
                label: '状态',
                options: ['0-全部', '1-连载中', '2-已完结'],
                default: '0',
            },
            {
                type: 'select',
                label: '排序',
                options: ['0-默认', '2-更新时间', '10-人气'],
                default: '0',
            },
        ],
        ranking: null,
    }

    // search
    search = {
        load: async (keyword, options, page) => {
            let url = `${this.baseUrl}/search?title=${encodeURIComponent(keyword)}&page=${page || 1}`;
            let res = await Network.get(url, this._headers());
            if (res.status !== 200) throw `搜索失败: ${res.status}`;
            let html = res.body || '';
            let comics = this._parseComics(html);
            let maxPage = this._parseMaxPage(html);
            if (maxPage < (page || 1)) maxPage = page || 1;
            if (comics.length === 0) maxPage = page || 1;
            return { comics: comics, maxPage: maxPage };
        },
        optionList: [],
        enableTagsSuggestions: false,
    }

    // single comic
    comic = {
        loadInfo: async (id) => {
            let targetUrl = id;
            if (!/^https?:/i.test(targetUrl)) targetUrl = this._abs(targetUrl);
            let res = await Network.get(targetUrl, this._headers());
            if (res.status !== 200) throw `请求失败，状态码: ${res.status}`;
            let html = res.body || '';
            let doc = new HtmlDocument(html);

            let title = '';
            let titleEl = doc.querySelector('h1');
            if (titleEl) title = titleEl.text.trim();
            if (!title) {
                let m = html.match(/<title>([^<]+)<\/title>/i);
                if (m) title = m[1].replace(/漫畫.*$/i, '').trim();
            }

            let cover = '';
            let imgEl = doc.querySelector('img[src*="cover.mangabz.com"]');
            if (imgEl) cover = this._abs(imgEl.attributes['src'] || '');
            if (!cover) {
                let m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
                if (m) cover = this._abs(m[1]);
            }

            let description = '';
            let descEl = doc.querySelector('.detail-desc');
            if (descEl) description = descEl.text.trim();
            if (!description) {
                let m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
                if (m) description = m[1].trim();
            }

            // 作者（链接形如 /search?title=xxx&f=2）
            let authors = [];
            let authorEls = doc.querySelectorAll('a[href*="f=2"]');
            for (let el of authorEls) {
                let t = el.text ? el.text.trim() : '';
                if (t) authors.push(t);
            }

            // 状态
            let status = '';
            let sm = html.match(/(連載中|已完結|完結)/);
            if (sm) status = sm[1];

            // 题材（链接形如 /manga-list-xx-0-0/）
            let genres = [];
            let genreEls = doc.querySelectorAll('a[href*="manga-list-"]');
            for (let el of genreEls) {
                let t = el.text ? el.text.trim() : '';
                if (t && t !== '全部') genres.push(t);
            }

            // 评分（形如 "2.0分"）
            let stars = null;
            let starM = html.match(/([\d.]+)分/);
            if (starM) {
                let v = parseFloat(starM[1]);
                if (!isNaN(v)) stars = v / 2; // 10分制 -> 5星制
            }

            // 章节：a.detail-list-form-item（含 .hide 隐藏项）
            let chapters = new Map();
            let chapterEls = doc.querySelectorAll('a.detail-list-form-item');
            for (let el of chapterEls) {
                let href = el.attributes['href'] || '';
                let name = el.text ? el.text.trim() : '';
                if (!href || !name) continue;
                name = name.replace(/\s*（\d+P）\s*$/i, '').trim();
                if (name) chapters.set(this._abs(href), name);
            }

            let tags = {};
            if (authors.length > 0) tags['作者'] = authors;
            if (status) tags['状态'] = [status];
            if (genres.length > 0) tags['题材'] = genres;

            return new ComicDetails({
                title: title,
                cover: cover,
                description: description || '暂无简介',
                tags: tags,
                chapters: chapters,
                updateTime: '',
                stars: stars,
            });
        },

        loadEp: async (comicId, epId) => {
            if (!epId) throw '章节 ID 为空';
            let epUrl = epId;
            if (!/^https?:/i.test(epUrl)) epUrl = this._abs(epUrl);
            if (!epUrl.endsWith('/')) epUrl += '/';

            let res = await Network.get(epUrl, this._headers({ 'referer': epId }));
            if (res.status !== 200) throw `获取章节页失败: ${res.status}`;
            let html = res.body || '';

            let cid = (html.match(/MANGABZ_CID=(\d+);/) || [])[1];
            let mid = (html.match(/MANGABZ_MID=(\d+);/) || [])[1];
            let total = (html.match(/MANGABZ_IMAGE_COUNT=(\d+);/) || [])[1];
            let dt = (html.match(/MANGABZ_VIEWSIGN_DT="([^"]+)";/) || [])[1];
            let sign = (html.match(/MANGABZ_VIEWSIGN="([^"]+)";/) || [])[1];

            if (!cid || !mid || !total || !dt || !sign) {
                // 兼容旧版：变量可能无引号或单引号
                cid = cid || ((html.match(/MANGABZ_CID\s*=\s*'?(\d+)'?;/) || [])[1]);
                mid = mid || ((html.match(/MANGABZ_MID\s*=\s*'?(\d+)'?;/) || [])[1]);
                total = total || ((html.match(/MANGABZ_IMAGE_COUNT\s*=\s*'?(\d+)'?;/) || [])[1]);
                dt = dt || ((html.match(/MANGABZ_VIEWSIGN_DT\s*=\s*["']([^"']+)["'];/) || [])[1]);
                sign = sign || ((html.match(/MANGABZ_VIEWSIGN\s*=\s*["']([^"']+)["'];/) || [])[1]);
            }
            if (!cid || !total || !dt || !sign) throw '无法解析章节参数，网站结构可能已变化';

            let images = [];
            let totalPages = parseInt(total, 10);
            for (let p = 1; p <= totalPages; p++) {
                let apiUrl = `${epUrl}chapterimage.ashx?cid=${cid}&page=${p}&key=&_cid=${cid}&_mid=${mid || ''}&_dt=${encodeURIComponent(dt)}&_sign=${sign}`;
                let apiRes = await Network.get(apiUrl, this._headers({ 'referer': epUrl }));
                if (apiRes.status !== 200) continue;
                let jsStr = apiRes.body || '';
                let list = null;
                try {
                    list = eval(jsStr);
                } catch (e) {
                    list = null;
                }
                // 响应可能是 var xxx=[...]; 形式（eval 返回 undefined 而非数组），取数组字面量兜底
                if (!Array.isArray(list)) {
                    let m = jsStr.match(/(\[[\s\S]*\])/);
                    if (m) {
                        try { list = eval(m[1]); } catch (e2) { list = null; }
                    }
                }
                if (Array.isArray(list)) {
                    for (let u of list) {
                        if (typeof u === 'string' && u) images.push(this._abs(u));
                    }
                }
            }
            if (images.length === 0) throw '未能获取章节图片';
            return { images: images };
        },

        onImageLoad: (url, comicId, epId) => {
            let referer = epId && /^https?:/i.test(epId) ? epId : this.baseUrl + '/';
            return {
                headers: {
                    'Referer': referer,
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
                },
            };
        },
    }
}
