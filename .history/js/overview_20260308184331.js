/**
 * 宏观地图逻辑控制 - 终极修复版
 * 解决了：移动端加载超时、搜索失效、无数据地区变黑、点击冲突
 */

// 1. 初始化地图：针对移动端优化 tap 交互
const map = L.map('map', { 
    zoomControl: false, 
    minZoom: 2,
    tap: false // 修复 iOS/Android 点击详情卡片不灵敏的问题
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

// 3. 指标视觉配置 (H: 色相)
const indicatorThemes = {
    gdp_per_capita: { h: 140, desc: "反映国民富裕程度。颜色越深，人均收入越高。", source: "世界银行 (World Bank) / IMF 2024" },
    gdp_total: { h: 210, desc: "反映国家经济总量。数据已折算为十亿美元。", source: "IMF WEO / 各省统计局 2024公报" },
    gdp_growth: { h: 30, desc: "反映经济活力。越橙红代表增长越快。", source: "各地区 2024 年度经济增速报告" },
    gini: { h: 0, desc: "反映收入分配公平性。数值越高贫富差距越大。", source: "世界银行 / 联合国开发计划署" },
    hdi: { h: 280, desc: "综合衡量发展水平（0-1）。反映人类发展质量。", source: "联合国开发计划署 (UNDP) 2024" },
    pop_density: { h: 340, desc: "反映人口聚集度。深红色代表极其拥挤。", source: "2024 全球人口展望" },
    median_age: { h: 200, desc: "反映人口老龄化程度。颜色越深代表平均年龄越高。", source: "CIA World Factbook" },
    internet_user: { h: 180, desc: "反映数字化程度。颜色越深代表普及率越高。", source: "ITU 国际电信联盟 / CNNIC" },
    forest_area: { h: 120, desc: "反映生态保护情况。颜色越深代表森林覆盖率越高。", source: "联合国粮农组织 (FAO)" },
    co2_per_capita: { h: 10, desc: "反映人均碳排放。颜色越深代表排放量越高。", source: "Global Carbon Project" },
    avg_temp: { h: 15, desc: "反映地区气候特征。颜色越深代表气温越高。", source: "NOAA / 欧洲中期预报中心" }
};

// 工具：安全获取国家中文名（防止字典未加载时报错）
function getCnName(enName) { 
    if (!enName) return "未知地区";
    return (typeof countryNameMap !== 'undefined' && countryNameMap[enName]) || enName; 
}

// 核心：计算连续色阶，增加 NaN 检查防止黑块
function getContinuousColor(val, indicator, theme) {
    const values = Object.values(macroData).map(d => parseFloat(d[indicator])).filter(v => !isNaN(v));
    if (values.length === 0 || isNaN(val)) return '#E0E0E0'; // 无数据地区显示灰色

    const min = Math.min(...values);
    const max = Math.max(...values);
    
    let pct = (val - min) / (max - min || 1);
    pct = Math.max(0, Math.min(1, pct)); 
    const l = 90 - (pct * 70); // 亮度从 90% 到 20%
    return `hsl(${theme.h}, 70%, ${l}%)`;
}

// 4. 更新视图：渲染地图颜色与图例
function updateView() {
    currentIndicator = document.getElementById('indicator-select').value;
    const theme = indicatorThemes[currentIndicator];
    
    // 获取当前指标的范围数据用于图例展示
    const values = Object.values(macroData).map(d => parseFloat(d[currentIndicator])).filter(v => !isNaN(v));
    const range = {
        min: values.length ? Math.min(...values) : 0,
        max: values.length ? Math.max(...values) : 100,
        avg: values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : 0
    };

    geojsonLayers.forEach(layer => {
        layer.setStyle(f => {
            const val = parseFloat(macroData[f.properties.name]?.[currentIndicator]);
            return {
                fillColor: getContinuousColor(val, currentIndicator, theme),
                weight: 1, color: 'white', fillOpacity: 0.8
            };
        });
    });

    // 更新 UI 图例
    document.getElementById('scale-bar').style.background = 
        `linear-gradient(to right, hsl(${theme.h}, 70%, 90%), hsl(${theme.h}, 70%, 20%))`;
    document.getElementById('label-min').innerText = range.min;
    document.getElementById('label-avg').innerText = range.avg;
    document.getElementById('label-max').innerText = range.max;
    
    const descEl = document.getElementById('indicator-desc');
    if(descEl) descEl.innerHTML = theme.desc;
}

// 5. 搜索功能
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
    
    // 如果搜的是 China，我们让地图飞到一个固定的中国中心坐标
    if (enName === "China") {
        map.flyTo([35, 105], 4); // 中国大致中心点
        showDetail("China");
        document.getElementById('search-results').style.display = 'none';
        document.getElementById('search-box').value = "中国";
        return;
    }

    // 其他国家或省份的正常跳转逻辑
    const target = layers.find(l => l.feature && l.feature.properties.name === enName);
    if(target) { 
        map.flyTo(target.getBounds().getCenter(), 5); 
        showDetail(enName); 
        document.getElementById('search-results').style.display = 'none'; 
        document.getElementById('search-box').value = getCnName(enName);
    }
}

function selectCountryFromButton() { handleSearch(); }

// 6. 详情卡片逻辑
function showDetail(enName) {
    const data = macroData[enName];
    document.getElementById('detail-title').innerText = getCnName(enName);
    
    let html = data ? Object.entries(data).map(([key, value]) => {
        if(key === "name_en" || key === "place_id") return ""; 
        return `<div class="data-row"><span>${fieldLabelMap[key] || key}</span><b>${value || '-'}</b></div>`;
    }).join('') : '<div style="padding:20px; color:#999;">暂无详细数据</div>';

    document.getElementById('detail-body').innerHTML = html;
    document.getElementById('detail-card').style.display = 'block';
}

function closeDetail() { document.getElementById('detail-card').style.display = 'none'; }
function toggleInfo() { document.getElementById('info-card').classList.toggle('collapsed'); }

// 7. 数据加载：核心修复点（使用 CDN 镜像防止手机端超时）
// 7. 数据加载：实现 CHN 映射与省份/国家双轨制
Papa.parse("../data/macro_data.csv", {
    download: true, 
    header: true, 
    complete: function(results) {
        // 1. 加载 CSV 数据
        results.data.forEach(r => { if(r.place_id) macroData[r.place_id] = r; });
        
        const localUrls = [
            '../data/world.json',
            '../data/china.json'
        ];
        
        Promise.all(localUrls.map(u => fetch(u).then(res => res.json()))).then(([world, china]) => {
            // --- 关键点 A：保留世界地图里的 China 作为一个“隐形成员”用于搜索 ---
            const chinaMainlandFeature = world.features.find(f => 
                f.properties.name === 'China' || f.properties.name === 'CHN'
            );
            
            // 过滤掉世界地图显示的旧中国块（避免重叠），但保留这个 feature 对象到搜索库
            const worldFiltered = world.features.filter(f => 
                f.properties.name !== 'China' && f.properties.name !== 'CHN'
            );

            // --- 关键点 B：标准化搜索库 ---
            // 我们把过滤后的世界地图 + 详细的中国省份 + 刚才提取的中国总体对象全部塞进搜索库
            allFeatures = [...worldFiltered, ...china.features];
            
            // 确保 "China" 存在于搜索库中
            if (chinaMainlandFeature) {
                // 强制修正名称为 China，确保匹配字典里的“中国”
                chinaMainlandFeature.properties.name = "China"; 
                allFeatures.push(chinaMainlandFeature);
            }

            // --- 关键点 C：渲染逻辑 ---
            const layerCfg = {
                style: { weight: 1, color: 'white', fillOpacity: 0.8 },
                onEachFeature: (f, l) => {
                    // 如果是省份，properties.name 通常是“广东省”等
                    // 如果是国家，properties.name 是 "China", "USA" 等
                    l.on('click', (e) => { 
                        L.DomEvent.stopPropagation(e); 
                        showDetail(f.properties.name); 
                    });
                    
                    l.on('mouseover', () => {
                        const val = macroData[f.properties.name]?.[currentIndicator] || "无";
                        l.bindTooltip(`<b>${getCnName(f.properties.name)}</b>: ${val}`, { sticky: true }).openTooltip();
                        l.setStyle({ weight: 2, color: '#333' });
                    });
                    l.on('mouseout', () => l.setStyle({ weight: 1, color: 'white' }));
                }
            };
            
            geojsonLayers = [
                L.geoJSON(worldFiltered, layerCfg).addTo(map),
                L.geoJSON(china, layerCfg).addTo(map)
            ];
            
            updateView();
        }).catch(err => {
            console.error("加载失败:", err);
        });
    }
});

map.on('click', closeDetail);