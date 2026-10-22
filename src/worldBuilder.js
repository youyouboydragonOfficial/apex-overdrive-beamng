/**
 * APEX OVERDRIVE: BeamNG Soft-Body Physics Edition v2.5
 * 3D Highway World, Destructible Environment Props, Weather & Day/Night System,
 * Crash Lab Props (Hydraulic Crusher, Wrecking Ball, Car Cannon)
 */

(function (global) {
    'use strict';

    const ROAD_WIDTH = 34;
    const LANE_CENTERS = [-13.5, -8.1, -2.7, 2.7, 8.1, 13.5];
    const HIGHWAY_SEGMENT_LENGTH = 260;

    // Time of Day Lighting Presets
    const TIME_OF_DAY_PRESETS = {
        NOON: { name: '昼 (NOON)', sky: 0x38bdf8, fog: 0x93c5fd, density: 0.0035, lightColor: 0xffffff, lightIntensity: 1.8, hemiGround: 0x334155 },
        SUNSET: { name: '夕方 (SUNSET)', sky: 0x7c2d12, fog: 0x9a3412, density: 0.0048, lightColor: 0xfb923c, lightIntensity: 1.5, hemiGround: 0x1e1b4b },
        MIDNIGHT: { name: '深夜 (MIDNIGHT)', sky: 0x050811, fog: 0x050811, density: 0.0050, lightColor: 0x38bdf8, lightIntensity: 0.9, hemiGround: 0x020617 },
        DAWN: { name: '朝焼け (DAWN)', sky: 0x4c1d95, fog: 0x831843, density: 0.0042, lightColor: 0xf472b6, lightIntensity: 1.4, hemiGround: 0x1e1b4b }
    };

    // 4 Selectable Maps
    const MAP_SPECS = {
        TOKYO: {
            id: 'TOKYO',
            name: '首都高湾岸6車線',
            sub: 'TOKYO BAYSHORE MIDNIGHT',
            info: '路面グリップ: 100% | 視界: ネオン夜景 | 6車線メガハイウェイ',
            skyColor: 0x050811,
            fogColor: 0x050811,
            fogDensity: 0.0048,
            roadTint: 0xffffff,
            barrierColor: 0x334155,
            sceneryColor: 0x0f172a,
            grip: 1.0,
            weatherType: 'NONE'
        },
        CANYON: {
            id: 'CANYON',
            name: 'サンセット大渓谷',
            sub: 'RED ROCK CANYON SUNSET',
            info: '路面グリップ: 95% | 視界: 夕陽＆砂塵 | ワイドハイウェイ',
            skyColor: 0x261008,
            fogColor: 0x42180b,
            fogDensity: 0.0050,
            roadTint: 0xfed7aa,
            barrierColor: 0x7c2d12,
            sceneryColor: 0x9a3412,
            grip: 0.95,
            weatherType: 'DUST'
        },
        SNOW: {
            id: 'SNOW',
            name: 'ブリザード雪山峠',
            sub: 'ALPS BLIZZARD EXPRESSWAY',
            info: '路面グリップ: 76% (凍結スリップ注意) | 視界: 吹雪',
            skyColor: 0x1e293b,
            fogColor: 0x334155,
            fogDensity: 0.0064,
            roadTint: 0xcbd5e1,
            barrierColor: 0x64748b,
            sceneryColor: 0xe2e8f0,
            grip: 0.76,
            weatherType: 'SNOW'
        },
        INFERNO: {
            id: 'INFERNO',
            name: '溶岩コンビナート',
            sub: 'VOLCANIC INDUSTRIAL ZONE',
            info: '路面グリップ: 92% | 視界: 火の粉＆赤熱溶岩地帯',
            skyColor: 0x160404,
            fogColor: 0x290808,
            fogDensity: 0.0056,
            roadTint: 0xfca5a5,
            barrierColor: 0x450a0a,
            sceneryColor: 0x27272a,
            grip: 0.92,
            weatherType: 'EMBER'
        }
    };

    // Rebalanced Difficulty Levels
    const LEVEL_SPECS = {
        1: {
            level: 1,
            name: 'Lv.1 ROOKIE',
            title: 'ルーキー・クルーズ',
            goalKm: 2.5,
            rewardCr: 15000,
            trafficCount: 4,
            trapCount: 2,
            etcInterval: 600,
            scoreMult: 1.0,
            trafficSpeedMult: 0.82,
            rageChance: 0.03,
            wrongWayChance: 0.00,
            desc: '目標 2.5km | 交通量少なめ・逆走車なし。軟体物理と高速追い越しの基本ステージ'
        },
        2: {
            level: 2,
            name: 'Lv.2 STREET PRO',
            title: 'ストリート・プロ',
            goalKm: 3.2,
            rewardCr: 25000,
            trafficCount: 6,
            trapCount: 2,
            etcInterval: 480,
            scoreMult: 1.5,
            trafficSpeedMult: 0.95,
            rageChance: 0.08,
            wrongWayChance: 0.04,
            desc: '目標 3.2km | ETC料金所ゲート・ジャンプ台が出現。まれに煽り運転車や逆走車も登場'
        },
        3: {
            level: 3,
            name: 'Lv.3 HAZARD KING',
            title: 'ハザード・キング',
            goalKm: 4.0,
            rewardCr: 40000,
            trafficCount: 7,
            trapCount: 3,
            etcInterval: 400,
            scoreMult: 2.2,
            trafficSpeedMult: 1.05,
            rageChance: 0.14,
            wrongWayChance: 0.10,
            desc: '目標 4.0km | 幅寄せ煽り運転車と高齢者逆走車が本格出現！レーダー警報を見て回避せよ'
        },
        4: {
            level: 4,
            name: 'Lv.4 NIGHTMARE',
            title: 'ナイトメア・ラン',
            goalKm: 4.8,
            rewardCr: 60000,
            trafficCount: 9,
            trapCount: 4,
            etcInterval: 340,
            scoreMult: 3.5,
            trafficSpeedMult: 1.15,
            rageChance: 0.18,
            wrongWayChance: 0.16,
            desc: '目標 4.8km | 高速域での逆走車＆煽り運転車との攻防！空き車線を見極めて突破せよ'
        },
        5: {
            level: 5,
            name: 'Lv.5 逆走・暴走クライマックス',
            title: 'OVERDRIVE FINALE',
            goalKm: 5.5,
            rewardCr: 100000,
            trafficCount: 10,
            trapCount: 4,
            etcInterval: 300,
            scoreMult: 5.0,
            trafficSpeedMult: 1.22,
            rageChance: 0.22,
            wrongWayChance: 0.22,
            desc: '目標 5.5km | 【最終決戦】高齢者逆走車＆悪質煽り運転車が次々迫るが必ず回避ルートあり！'
        }
    };

    function createProceduralRoadTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#131720';
        ctx.fillRect(0, 0, 1024, 1024);

        for (let i = 0; i < 32000; i++) {
            const x = Math.random() * 1024;
            const y = Math.random() * 1024;
            const shade = 16 + Math.floor(Math.random() * 26);
            ctx.fillStyle = `rgb(${shade}, ${shade + 3}, ${shade + 8})`;
            ctx.fillRect(x, y, 2, 2);
        }

        const numLanes = 6;
        const laneWidthPx = (1024 - 72) / numLanes;
        for (let l = 0; l < numLanes; l++) {
            const cx = 36 + laneWidthPx * (l + 0.5);
            const grad = ctx.createLinearGradient(cx - 60, 0, cx + 60, 0);
            grad.addColorStop(0, 'rgba(8,10,14,0)');
            grad.addColorStop(0.3, 'rgba(8,10,14,0.42)');
            grad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
            grad.addColorStop(0.7, 'rgba(8,10,14,0.42)');
            grad.addColorStop(1, 'rgba(8,10,14,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(cx - 60, 0, 120, 1024);
        }

        for (let y = 0; y < 1024; y += 64) {
            ctx.fillStyle = (y / 64) % 2 === 0 ? '#ef4444' : '#f8fafc';
            ctx.fillRect(4, y, 16, 64);
            ctx.fillRect(1024 - 20, y, 16, 64);
        }

        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(24, 0, 10, 1024);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(1024 - 34, 0, 10, 1024);

        for (let d = 1; d < numLanes; d++) {
            const dx = 36 + laneWidthPx * d;
            if (d === 3) {
                ctx.fillStyle = '#38bdf8';
                for (let y = 0; y < 1024; y += 128) {
                    ctx.fillRect(dx - 5, y + 12, 10, 80);
                }
            } else {
                ctx.fillStyle = '#e2e8f0';
                for (let y = 0; y < 1024; y += 128) {
                    ctx.fillRect(dx - 4, y + 18, 8, 66);
                }
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 14);
        texture.anisotropy = 8;
        return texture;
    }

    function createProceduralEnvTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0.0, '#020617');
        grad.addColorStop(0.38, '#0f172a');
        grad.addColorStop(0.47, '#38bdf8');
        grad.addColorStop(0.51, '#fb923c');
        grad.addColorStop(0.56, '#1e293b');
        grad.addColorStop(1.0, '#090d16');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 256);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        for (let i = 0; i < 16; i++) {
            ctx.fillRect(i * 32 + 8, 64, 18, 8);
            ctx.fillRect(i * 32 + 4, 112, 22, 6);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.mapping = THREE.EquirectangularReflectionMapping;
        return texture;
    }

    function createFinishGoalArch(zOffset = -195) {
        const group = new THREE.Group();
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.8, roughness: 0.2 });
        const bannerMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });

        [-ROAD_WIDTH / 2 + 0.5, ROAD_WIDTH / 2 - 0.5].forEach(px => {
            const p = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 9.5, 16), pillarMat);
            p.position.set(px, 4.75, 0);
            group.add(p);
        });

        const topBeam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH + 2, 1.8, 1.4), bannerMat);
        topBeam.position.set(0, 8.8, 0);
        group.add(topBeam);

        for (let i = -15; i <= 15; i += 2) {
            const chk = new THREE.Mesh(
                new THREE.BoxGeometry(1.8, 0.6, 1.5),
                new THREE.MeshBasicMaterial({ color: Math.abs(i / 2) % 2 === 0 ? 0xffffff : 0x0f172a })
            );
            chk.position.set(i, 7.6, 0);
            group.add(chk);
        }

        const finishLine = new THREE.Mesh(
            new THREE.PlaneGeometry(ROAD_WIDTH, 3.0),
            new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
        );
        finishLine.rotation.x = Math.PI / 2;
        finishLine.position.y = 0.05;
        group.add(finishLine);

        group.position.set(0, 0, zOffset);
        return {
            mesh: group,
            type: 'FINISH_GOAL',
            width: ROAD_WIDTH,
            length: 4.0,
            triggered: false
        };
    }

    /**
     * Creates Advanced BeamNG Crash Lab Obstacles:
     * - 50t Hydraulic Crusher Press (油圧クラッシャー)
     * - Giant Wrecking Ball Pendulum (巨大鉄球ペンデュラム)
     * - High-Speed Car Cannon Catapult (400km/h 射出ランチャー)
     * - Concrete Crash Wall (衝突試験バリア)
     */
    function createSandboxObstacle(subType, laneX, zOffset = -150) {
        const group = new THREE.Group();
        let width = 3.8, length = 3.2;

        if (subType === 'CRUSHER') {
            width = 4.4; length = 2.6;
            const postMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.7, roughness: 0.3 });
            [-2.1, 2.1].forEach(px => {
                const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.2, 0.8), postMat);
                post.position.set(px, 1.6, 0);
                group.add(post);
            });
            const drum = new THREE.Mesh(
                new THREE.CylinderGeometry(0.68, 0.68, 3.9, 16),
                new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.85, roughness: 0.2 })
            );
            drum.rotation.z = Math.PI / 2;
            drum.position.set(0, 1.15, 0);
            group.add(drum);
            group.userData.spinner = drum;
        } else if (subType === 'WRECKING_BALL') {
            width = 4.0; length = 3.0;
            const frame = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x475569 }));
            frame.position.y = 6.8;
            const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.8, 6), new THREE.MeshBasicMaterial({ color: 0x94a3b8 }));
            chain.position.set(0, 4.4, 0);
            const ball = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 16), new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.95, roughness: 0.1 }));
            ball.position.set(0, 1.8, 0);
            group.add(frame, chain, ball);
            group.userData.pendulumBall = ball;
            group.userData.pendulumChain = chain;
        } else if (subType === 'CANNON') {
            width = 3.6; length = 5.2;
            const tube = new THREE.Mesh(
                new THREE.CylinderGeometry(1.4, 1.4, 4.8, 16),
                new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.2 })
            );
            tube.rotation.x = Math.PI / 2;
            tube.position.set(0, 1.2, 0);
            const base = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.4, 5.2), new THREE.MeshStandardMaterial({ color: 0x0f172a }));
            base.position.y = 0.2;
            group.add(tube, base);
        } else if (subType === 'CONCRETE_WALL') {
            width = 2.6; length = 2.4;
            const block = new THREE.Mesh(new THREE.BoxGeometry(width, 1.65, length), new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.6 }));
            block.position.y = 0.825;
            const orangeFace = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, 1.45, 0.25), new THREE.MeshBasicMaterial({ color: 0xf97316 }));
            orangeFace.position.set(0, 0.825, length / 2 + 0.05);
            group.add(block, orangeFace);
        }

        group.position.set(laneX, 0, zOffset);
        return {
            mesh: group,
            type: subType,
            width,
            length,
            triggered: false
        };
    }

    global.ApexWorldBuilder = {
        ROAD_WIDTH,
        LANE_CENTERS,
        HIGHWAY_SEGMENT_LENGTH,
        TIME_OF_DAY_PRESETS,
        MAP_SPECS,
        LEVEL_SPECS,
        createProceduralRoadTexture,
        createProceduralEnvTexture,
        createFinishGoalArch,
        createSandboxObstacle
    };
})(window);
