/**
 * 宏观地图逻辑控制 - 多端兼容修复版
 */

// 1. 初始化地图：禁用默认缩放键并移至左下角
const map = L.map('map', { 
    zoomControl: false, 
    minZoom: 2,
    tap: false // 修复 iOS/移动端点击冲突
}).setView([30, 10], 2);

L.control.zoom({ position: 'bottomleft' }).addTo(map);

let macroData = {}, geojsonLayers = [], allFeatures = [];
let currentIndicator = 'gdp_per_capita';

// 2. 字段名汉化映射
const fieldLabelMap = {
    "place_id": "地区 ID",
    "gdp_total": "GDP 总额 (十亿$)",
    "gdp_per_capita": "人均 GDP ($)",
    "gdp_growth": "经济增长率 (%)",
    "pop_density": "人口密度 (人/km²)",
    "hdi": "人类发展指数 (HDI)",
    "median_age": "年龄中位数",
    "internet_user": "互联网普及率 (%)",
    "gini": "基尼系数",
    "forest_area": "森林覆盖率 (%)",
    "co2_per_capita": "人均碳排放",
    "avg_temp": "平均气温 (℃)"
};

// 3. 指标视觉配置
const indicatorThemes = {
    gdp_per_capita: { h: 140, desc: "反映国民富裕程度。颜色越深，人均收入越高。" },
    gdp_total: { h: 210, desc: "反映国家经济总量。颜色越深，体量越大。" },
    gdp_growth: { h: 30, desc: "反映经济活力。越橙红代表增长越快。" },
    gini: { h: 0, desc: "反映收入分配公平性。颜色越深代表贫富差距越大。" },
    hdi: { h: 280, desc: "综合衡量发展水平。紫色越深代表发展水平越高。" },
    pop_density: { h: 340, desc: "反映人口聚集度。深红色代表极其拥挤。" },
    median_age: { h: 200, desc: "反映人口老龄化程度。颜色越深代表平均年龄越高。" },
    internet_user: { h: 180, desc: "反映数字化程度。颜色越深代表普及率越高。" },
    forest_area: { h: 120, desc: "反映生态保护情况。颜色越深代表森林覆盖率越高。" },
    co2_per_capita: { h: 10, desc: "反映人均碳排放。颜色越深代表排放量越高。" },
    avg_temp: { h: 15, desc: "反映地区气候特征。颜色越深代表气温越高。" }
};

// 工具：安全获取国家中文名
function getCnName(enName) { 
    if (!enName) return "未知地区";
    return (typeof countryNameMap !== 'undefined' && countryNameMap[enName]) || enName; 
}

// 核心：计算连续色阶
function getDataRange(indicator) {
    const values = Object.values(macroData).map(d => parseFloat(d[indicator])).filter(v => !isNaN(v));
    if (values.length === 0) return { min: 0, max: 100, avg: 0 };
    return {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)
    };
}

function getContinuousColor(val, range, hue) {
    if (val === null || val === undefined || isNaN(val)) return '#E0E0E0'; // 无数据地区显示浅灰色
    let pct = (val - range.min) / (range.max - range.min || 1);
    pct = Math.max(0, Math.min(1, pct)); 
    const l = 90 - (pct * 70); 
    return `hsl(${hue}, 70%, ${l}%)`;
}

// 4. 更新视图
function updateView() {
    currentIndicator = document.getElementById('indicator-select').value;
    const range = getDataRange(currentIndicator);
    const theme = indicatorThemes[currentIndicator];

    geojsonLayers.forEach(layer => {
        layer.setStyle(f => {
            const val = macroData[f.properties.name]?.[currentIndicator];
            return {
                fillColor: getContinuousColor(parseFloat(val), range, theme.h),
                weight: 1, color: 'white', fillOpacity: 0.8
            };
        });
    });

    document.getElementById('scale-bar').style.background = 
        `linear-gradient(to right, hsl(${theme.h}, 70%, 90%), hsl(${theme.h}, 70%, 20%))`;
    document.getElementById('label-min').innerText = range.min;
    document.getElementById('label-avg').innerText = range.avg;
    document.getElementById('label-max').innerText = range.max;
    
    const descEl = document.getElementById('indicator-desc');
    if(descEl) descEl.innerHTML = theme.desc;
}

// 交互函数
function toggleInfo() { document.getElementById('info-card').classList.toggle('collapsed'); }
function closeDetail() { document.getElementById('detail-card').style.display = 'none'; }

function showDetail(enName) {
    const data = macroData[enName];
    document.getElementById('detail-title').innerText = getCnName(enName);
    
    let html = "";
    if (data) {
        html = Object.entries(data).map(([key, value]) => {
            if(key === "name_en" || key === "place_id") return ""; 
            const label = fieldLabelMap[key] || key;
            return `<div class="data-row"><span>${label}</span><b>${value || '-'}</b></div>`;
        }).join('');
    } else {
        html = '<div style="padding:20px; color:#999;">暂无该地区详细数据</div>';
    }
    document.getElementById('detail-body').innerHTML = html;
    document.getElementById('detail-card').style.display = 'block';
}

// 5. 增强搜索逻辑
function handleSearch() {
    const q = document.getElementById('search-box').value.trim().toLowerCase();
    const resDiv = document.getElementById('search-results');
    
    if(!q || allFeatures.length === 0) { 
        resDiv.style.display = 'none'; 
        return; 
    }

    const matches = allFeatures.filter(f => {
        const enName = (f.properties.name || "").toLowerCase();
        const cnName = getCnName(f.properties.name).toLowerCase();
        return cnName.includes(q) || enName.includes(q);
    }).slice(0, 8);

    if (matches.length > 0) {
        resDiv.innerHTML = matches.map(f => `
            <div class="search-item" onclick="selectCountry('${f.properties.name}')">
                ${getCnName(f.properties.name)}
            </div>
        `).join('');
        resDiv.style.display = 'block';
    } else {
        resDiv.style.display = 'none';
    }
}

function selectCountry(enName) {
    const layers = geojsonLayers.flatMap(l => Object.values(l._layers));
    const target = layers.find(l => l.feature && l.feature.properties.name === enName);
    if(target) { 
        map.flyTo(target.getBounds().getCenter(), 4); 
        showDetail(enName); 
        document.getElementById('search-results').style.display = 'none'; 
        document.getElementById('search-box').value = getCnName(enName);
    }
}

function selectCountryFromButton() {
    handleSearch(); // 确保列表已弹出
    const q = document.getElementById('search-box').value.trim().toLowerCase();
    if (!q) return;

    const target = allFeatures.find(f => {
        const enName = (f.properties.name || "").toLowerCase();
        const cnName = getCnName(f.properties.name).toLowerCase();
        return cnName === q || enName === q;
    });

    if (target) {
        selectCountry(target.properties.name);
    } else {
        const firstMatch = allFeatures.find(f => getCnName(f.properties.name).toLowerCase().includes(q));
        if (firstMatch) selectCountry(firstMatch.properties.name);
    }
}

// 6. 数据加载逻辑：优化错误处理与资源合并顺序
Papa.parse("../data/macro_data.csv", {
    download: true, 
    header: true, 
    skipEmptyLines: true,
    complete: function(results) {
        results.data.forEach(r => { if(r.place_id) macroData[r.place_id] = r; });
        
        const urls = [
            'https://fastly.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json',
            'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json'
        ];
        
        Promise.all(urls.map(u => fetch(u).then(res => {
            if(!res.ok) throw new Error("Network error");
            return res.json();
        }))).then(([world, china]) => {
            // 过滤重复中国数据
            const worldFiltered = world.features.filter(f => f.properties.name !== 'China' && f.properties.name !== 'United Republic of Tanzania');
            
            // 重要：先填库，再画图，确保搜索立即可用
            allFeatures = [...worldFiltered, ...china.features];
            
            const layerCfg = {
                style: { weight: 1, color: 'white', fillOpacity: 0.8 },
                onEachFeature: (f, l) => {
                    l.on('click', (e) => { 
                        L.DomEvent.stopPropagation(e); 
                        showDetail(f.properties.name); 
                    });
                    l.on('mouseover', () => {
                        const val = macroData[f.properties.name]?.[currentIndicator] || "无数据";
                        l.bindTooltip(`<b>${getCnName(f.properties.name)}</b>: ${val}`, { sticky: true }).openTooltip();
                        l.setStyle({ weight: 2, color: '#333' });
                    });
                    l.on('mouseout', () => l.setStyle({ weight: 1, color: 'white' }));
                }
            };
            
            // 将图例层加入管理数组
            const wl = L.geoJSON(worldFiltered, layerCfg).addTo(map);
            const cl = L.geoJSON(china, layerCfg).addTo(map);
            geojsonLayers = [wl, cl];
            
            updateView();
        }).catch(err => {
            console.error("加载失败:", err);
            // 手机端显示一个友好的提示
            alert("地图数据下载超时，请检查网络或切换到更稳定的 Wi-Fi 环境。");
        });
    }
});

map.on('click', closeDetail);