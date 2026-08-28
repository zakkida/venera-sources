/** @type {import('../_venera_.js')} */
// 無限動漫（8comic.com）漫画源
// 繁体中文日漫为主的免费大站，存量巨大（火影/海贼/柯南/全职猎人等 + 大量新番）。
// 章节图片 URL 由页面混淆 JS 生成，loadEp 按三层策略兜底解析。
class Manga8comic extends ComicSource {
    name = "無限動漫"

    key = "8comic"

    version = "1.0.0"

    minAppVersion = "1.6.0"

    url = ""

    get baseUrl() {
        return "https://www.8comic.com";
    }

    _headers(extra) {
        return Object.assign({
            'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
            'Referer': this.baseUrl + '/',
        }, extra || {});
    }

    _abs(url) {
        if (!url) return '';
        url = url.trim();
        if (/^https?:/i.test(url)) return url;
        if (url.startsWith('//')) return 'https:' + url;
        return this.baseUrl + url;
    }

    // 解析漫画列表条目（首页 / 分类 / 搜索共用）：封面 + /html/{id}.html 链接
    _parseComics(html) {
        let comics = [];
        let doc = new HtmlDocument(html);
        let links = doc.querySelectorAll('a[href*="/html/"]');
        let seen = {};
        for (let i = 0; i < links.length; i++) {
            let a = links[i];
            let href = a.attributes['href'] || '';
            if (!/^\/html\/\d+\.html$/.test(href)) continue;
            let title = (a.attributes['title'] || '').trim() || (a.text ? a.text.trim() : '');
            if (!title) continue;
            let img = a.querySelector('img');
            let cover = img ? (img.attributes['data-src'] || img.attributes['src'] || '') : '';
            if (!cover) {
                // 部分条目封面在链接外，向上找父容器再找 img
                let parent = a.parent;
                if (parent) {
                    let pimg = parent.querySelector('img');
                    if (pimg) cover = pimg.attributes['data-src'] || pimg.attributes['src'] || '';
                }
            }
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
            return [{ title: '最新更新', comics: comics.slice(0, 24) }];
        },
    }]

    // categories（分类 id 来自站内分类链接 /comic/{id}-1.html）
    category = {
        title: "無限動漫",
        parts: [{
            name: "分类",
            type: "fixed",
            itemType: "category",
            categories: [
                "全部", "武鬥類", "刀劍類", "熱血類", "冒險類",
                "校園類", "魔法類", "偵探類", "機械類", "恐怖類",
                "懸疑類", "奇幻類", "足球類", "籃球類", "玄幻修仙",
                "港漫系列", "少女幻想", "校園戀愛", "魔法少女", "現代生活",
            ],
            categoryParams: [
                "all", "24", "4", "58", "6",
                "26", "3", "5", "7", "19",
                "392", "410", "33", "34", "54",
                "9", "15", "14", "66", "419",
            ],
        }],
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let cat = param || 'all';
            let url = cat === 'all'
                ? `${this.baseUrl}/comic/u-${page || 1}.html`
                : `${this.baseUrl}/comic/${cat}-${page || 1}.html`;
            let res = await Network.get(url, this._headers());
            if (res.status !== 200) throw `加载分类失败: ${res.status}`;
            let html = res.body || '';
            let comics = this._parseComics(html);
            let maxPage = this._parseMaxPage(html);
            if (maxPage < (page || 1)) maxPage = page || 1;
            if (comics.length === 0) maxPage = page || 1;
            return { comics: comics, maxPage: maxPage };
        },
        optionList: [],
        ranking: null,
    }

    _parseMaxPage(html) {
        // 8comic 分页链接形如 /comic/{cat}-{page}.html 或 /comic/u-{page}.html
        let max = 1;
        let re = /\/comic\/[a-z0-9]+-(\d+)\.html/gi;
        let m;
        while ((m = re.exec(html)) !== null) {
            let n = parseInt(m[1], 10);
            if (!isNaN(n) && n > max) max = n;
        }
        return max;
    }

    // search
    search = {
        load: async (keyword, options, page) => {
            let url = `${this.baseUrl}/search/?key=${encodeURIComponent(keyword)}`;
            let res = await Network.get(url, this._headers());
            if (res.status !== 200) throw `搜索失败: ${res.status}`;
            let html = res.body || '';
            let comics = this._parseComics(html);
            // 搜索结果分页格式未知，先只取第一页
            return { comics: comics, maxPage: 1 };
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

            // 标题
            let title = '';
            let titleEl = doc.querySelector('h1') || doc.querySelector('h2');
            if (titleEl) title = titleEl.text.trim();
            if (!title) {
                let m = html.match(/<title>([^<]+)<\/title>/i);
                if (m) title = m[1].replace(/\s*-\s*無限動漫.*$/i, '').split(' ')[0].trim();
            }

            // 封面：详情页顶部大图（pics 目录）
            let cover = '';
            let coverEl = doc.querySelector('img[src*="/pics/"]');
            if (coverEl) cover = this._abs(coverEl.attributes['src'] || '');
            if (!cover) {
                let m = html.match(/<img[^>]+src="([^"]*\/pics\/[^"]+)"[^>]*>/i);
                if (m) cover = this._abs(m[1]);
            }

            // 作者
            let author = '';
            let am = html.match(/作者[:：]\s*([^<|]{1,60})/);
            if (am) author = am[1].trim();

            // 状态
            let status = '';
            let sm = html.match(/(連載中|已完結|完結)/);
            if (sm) status = sm[1];

            // 简介（第一个较长文本段）
            let description = '';
            let dm = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
            if (dm) description = dm[1].trim();

            // 章节：链接形如 /online/new-{id}.html?ch={ep}
            let chapters = new Map();
            let chapterEls = doc.querySelectorAll('a[href*="/online/"]');
            for (let el of chapterEls) {
                let href = el.attributes['href'] || '';
                if (href.indexOf('?ch=') < 0) continue;
                let name = el.text ? el.text.trim() : '';
                if (!name) name = (el.attributes['title'] || '').trim();
                if (!href || !name) continue;
                chapters.set(this._abs(href), name);
            }

            let tags = {};
            if (author) tags['作者'] = [author];
            if (status) tags['状态'] = [status];

            return new ComicDetails({
                title: title,
                cover: cover,
                description: description || '',
                tags: tags,
                chapters: chapters,
            });
        },

        // 章节图片解析：三层兜底
        // 1. HTML 中的字面量图片 URL（'//imgX.8comic.com/...jpg'）
        // 2. .src=unescape('...')
        // 3. 从页面混淆脚本提取变量与函数，eval 生成
        loadEp: async (comicId, epId) => {
            if (!epId) throw '章节 ID 为空';
            let epUrl = epId;
            if (!/^https?:/i.test(epUrl)) epUrl = this._abs(epUrl);
            let res = await Network.get(epUrl, this._headers({ 'Referer': epUrl }));
            if (res.status !== 200) throw `获取章节页失败: ${res.status}`;
            let html = res.body || '';

            let images = [];
            // 策略 1：字面量 URL
            let re = /['"]?(\/\/img\d+\.8comic\.com\/[^'"\s<>]+\.jpg)/gi;
            let m;
            while ((m = re.exec(html)) !== null) {
                let u = m[1].trim();
                if (u && images.indexOf(u) < 0) images.push(u);
            }
            // 策略 2：unescape
            if (images.length === 0) {
                let um = html.match(/\.src\s*=\s*unescape\('([^']+)'\)/i);
                if (um) {
                    try {
                        let decoded = decodeURIComponent(um[1]);
                        let urls = decoded.match(/\/\/img\d+\.8comic\.com\/[^'"\s<>]+\.jpg/gi) || [];
                        images = urls;
                    } catch (e) { /* ignore */ }
                }
            }
            // 策略 3：eval 混淆脚本生成
            if (images.length === 0) {
                images = this._genImagesFromScript(html);
            }
            if (images.length === 0) throw '未能获取章节图片，网站解析方式可能已变化';
            return { images: images.map(u => this._abs(u)) };
        },

        onImageLoad: (url, comicId, epId) => {
            let referer = epId && /^https?:/i.test(epId) ? epId : this.baseUrl + '/';
            return {
                headers: {
                    'Referer': referer,
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
                },
            };
        },
    }

    // 提取章节页混淆脚本（含 tmkqp 变量），eval 出所有图片 URL
    _genImagesFromScript(html) {
        let sm = html.match(/<script[^>]*>([\s\S]*?tmkqp[\s\S]*?)<\/script>/i);
        if (!sm) return [];
        let script = sm[1];
        let code = script + '\n;(function(){var r=[];for(var d=1;d<=ps;d++){r.push("//img"+su(tmkqp,0,1)+".8comic.com/"+su(tmkqp,1,1)+"/"+ti+"/"+vnnlw+"/"+nn(d)+"_"+su(cewds,mm(d),3)+".jpg");}return r;})();';
        try {
            let urls = eval(code);
            if (Array.isArray(urls)) return urls;
        } catch (e) { /* 脚本含页面依赖时降级 */ }
        return [];
    }
}
