/** @type {import('../_venera_.js')} */
// MangaPill 漫画源 —— https://mangapill.com
// 英文日漫站，图片走 CDN（cdn.readdetectiveconan.com）且无防盗链，加载快。
class MangaPill extends ComicSource {
    name = "MangaPill"

    key = "mangapill"

    version = "1.0.0"

    minAppVersion = "1.6.0"

    url = ""

    get baseUrl() {
        return "https://mangapill.com";
    }

    _headers() {
        return {
            'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'accept-language': 'en-US,en;q=0.9',
        };
    }

    _abs(url) {
        if (!url) return '';
        url = url.trim();
        if (/^https?:/i.test(url)) return url;
        if (url.startsWith('//')) return 'https:' + url;
        return this.baseUrl + url;
    }

    // 解析漫画卡片（首页 / 搜索结果共用）：a[href^="/manga/"] + img
    _parseComics(html) {
        let comics = [];
        let doc = new HtmlDocument(html);
        let links = doc.querySelectorAll('a[href^="/manga/"]');
        let seen = {};
        for (let i = 0; i < links.length; i++) {
            let a = links[i];
            let href = a.attributes['href'] || '';
            if (!/^\/manga\/\d+\//.test(href)) continue;
            let title = (a.attributes['title'] || '').trim() || (a.text ? a.text.trim() : '');
            if (!title) continue;
            let img = a.querySelector('img');
            let cover = img ? (img.attributes['data-src'] || img.attributes['src'] || '') : '';
            let id = this._abs(href);
            if (seen[id]) continue;
            seen[id] = 1;
            comics.push(new Comic({
                id: id,
                title: title,
                cover: this._abs(cover),
            }));
        }
        return comics;
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
            return [{ title: 'Trending & New', comics: comics.slice(0, 24) }];
        },
    }]

    // categories
    category = {
        title: "MangaPill",
        parts: [{
            name: "Genres",
            type: "fixed",
            itemType: "category",
            categories: [
                "Action", "Adventure", "Comedy", "Drama", "Fantasy",
                "Horror", "Isekai", "Mystery", "Romance", "School",
                "Sci-Fi", "Seinen", "Shoujo", "Shounen", "Slice of Life",
                "Sports", "Supernatural", "Harem", "Ecchi", "Historical",
            ],
            categoryParams: [
                "Action", "Adventure", "Comedy", "Drama", "Fantasy",
                "Horror", "Isekai", "Mystery", "Romance", "School",
                "Sci-Fi", "Seinen", "Shoujo", "Shounen", "Slice of Life",
                "Sports", "Supernatural", "Harem", "Ecchi", "Historical",
            ],
        }],
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let genre = param || 'Action';
            let url = `${this.baseUrl}/search?genre=${encodeURIComponent(genre)}&page=${page || 1}`;
            let res = await Network.get(url, this._headers());
            if (res.status !== 200) throw `加载分类失败: ${res.status}`;
            let html = res.body || '';
            let comics = this._parseComics(html);
            let maxPage = 1;
            let m;
            let re = /[?&]page=(\d+)/g;
            while ((m = re.exec(html)) !== null) {
                let n = parseInt(m[1], 10);
                if (!isNaN(n) && n > maxPage) maxPage = n;
            }
            if (comics.length === 0) maxPage = page || 1;
            return { comics: comics, maxPage: maxPage };
        },
        optionList: [],
        ranking: null,
    }

    // search
    search = {
        load: async (keyword, options, page) => {
            let url = `${this.baseUrl}/search?q=${encodeURIComponent(keyword)}&page=${page || 1}`;
            let res = await Network.get(url, this._headers());
            if (res.status !== 200) throw `搜索失败: ${res.status}`;
            let html = res.body || '';
            let comics = this._parseComics(html);
            let maxPage = 1;
            let m;
            let re = /[?&]page=(\d+)/g;
            while ((m = re.exec(html)) !== null) {
                let n = parseInt(m[1], 10);
                if (!isNaN(n) && n > maxPage) maxPage = n;
            }
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
                if (m) title = m[1].replace(/\s*-\s*Mangapill.*$/i, '').trim();
            }

            let cover = '';
            let coverEl = doc.querySelector('img[src*="file/mangapill"]');
            if (coverEl) cover = this._abs(coverEl.attributes['src'] || coverEl.attributes['data-src'] || '');

            // 简介：第一个较长的 <p>
            let description = '';
            let ps = doc.querySelectorAll('p');
            for (let p of ps) {
                let t = p.text ? p.text.trim() : '';
                if (t.length > 50) { description = t; break; }
            }

            // 类型 / 状态 / 年份
            let type = '', status = '', year = '';
            let tm = html.match(/Type[^a-zA-Z]{0,30}(manga|novel|one-shot|manhua|doujinshi|oel)/i);
            if (tm) type = tm[1];
            let sm = html.match(/(publishing|finished|on hiatus|discontinued|not yet published)/i);
            if (sm) status = sm[1];
            let ym = html.match(/Year[^0-9]{0,20}(\d{4})/i);
            if (ym) year = ym[1];

            // 题材
            let genres = [];
            let genreEls = doc.querySelectorAll('a[href*="genre="]');
            for (let el of genreEls) {
                let t = el.text ? el.text.trim() : '';
                if (t) genres.push(t);
            }

            // 章节：详情页所有 /chapters/ 链接
            let chapters = new Map();
            let chapterEls = doc.querySelectorAll('a[href^="/chapters/"]');
            for (let el of chapterEls) {
                let href = el.attributes['href'] || '';
                let name = (el.attributes['title'] || '').trim() || (el.text ? el.text.trim() : '');
                if (!href || !name) continue;
                chapters.set(this._abs(href), name);
            }

            let tags = {};
            if (type) tags['Type'] = [type];
            if (status) tags['Status'] = [status];
            if (year) tags['Year'] = [year];
            if (genres.length > 0) tags['Genres'] = genres;

            return new ComicDetails({
                title: title,
                cover: cover,
                description: description || '',
                tags: tags,
                chapters: chapters,
            });
        },

        loadEp: async (comicId, epId) => {
            if (!epId) throw '章节 ID 为空';
            let epUrl = epId;
            if (!/^https?:/i.test(epUrl)) epUrl = this._abs(epUrl);
            let res = await Network.get(epUrl, this._headers());
            if (res.status !== 200) throw `获取章节页失败: ${res.status}`;
            let html = res.body || '';
            let doc = new HtmlDocument(html);
            let images = [];
            let imgs = doc.querySelectorAll('img');
            for (let img of imgs) {
                let src = img.attributes['data-src'] || img.attributes['src'] || '';
                // 章节图片 CDN 路径含 /file/mangap/，排除封面域名 /file/mangapill/ 与广告
                if (src.indexOf('file/mangap/') >= 0 && src.indexOf('file/mangapill') < 0) {
                    images.push(this._abs(src));
                }
            }
            if (images.length === 0) throw '未能获取章节图片';
            return { images: images };
        },

        onImageLoad: (url, comicId, epId) => {
            return {
                headers: {
                    'Referer': this.baseUrl + '/',
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
                },
            };
        },
    }
}
