/** Classic Chinese Aeroplane Chess (飛行棋) board geometry.
 *  Coordinates match Wikimedia Commons “Fei xing qi board (BYGR).svg”
 *  (Mliu92, CC BY-SA 4.0), a 950×950 cross-shaped board.
 */

export const COLORS = ["yellow", "green", "red", "blue"];

export const COLOR_META = {
  yellow: {
    id: "yellow",
    nameZh: "黃",
    animalZh: "貓",
    pieceSrc: "/img/pieces/yellow-cat.png",
    hex: "#e6c200",
    hexDark: "#9a7b00",
    hexLight: "#ffe566",
    launch: 3,
    entrance: 0,
    flyStart: 20,
    flyEnd: 32,
    opposite: "red",
  },
  green: {
    id: "green",
    nameZh: "綠",
    animalZh: "龜",
    pieceSrc: "/img/pieces/green-turtle.png",
    hex: "#1f8a3a",
    hexDark: "#0d5c22",
    hexLight: "#5dcc74",
    launch: 16,
    entrance: 13,
    flyStart: 33,
    flyEnd: 45,
    opposite: "blue",
  },
  red: {
    id: "red",
    nameZh: "紅",
    animalZh: "兔",
    pieceSrc: "/img/pieces/red-rabbit.png",
    hex: "#d42323",
    hexDark: "#8e1010",
    hexLight: "#ff6b6b",
    launch: 29,
    entrance: 26,
    flyStart: 46,
    flyEnd: 6,
    opposite: "yellow",
  },
  blue: {
    id: "blue",
    nameZh: "藍",
    animalZh: "狗",
    pieceSrc: "/img/pieces/blue-dog.png",
    hex: "#1a4fd8",
    hexDark: "#0d2e86",
    hexLight: "#6b93ff",
    launch: 42,
    entrance: 39,
    flyStart: 7,
    flyEnd: 19,
    opposite: "green",
  },
};

export function colorTitle(color) {
  const m = COLOR_META[color];
  return m ? `${m.nameZh}${m.animalZh}` : "";
}

/** Clockwise outer track, 52 squares. Index 0 = yellow turning arrow (left arm tip). */
export const TRACK = [
  [85.0, 475.0],
  [100.0, 425.0],
  [100.0, 375.0],
  [123.48, 323.48],
  [175.0, 300.0],
  [225.0, 300.0],
  [278.7, 319.29],
  [319.29, 278.7],
  [300.0, 225.0],
  [300.0, 175.0],
  [323.48, 123.48],
  [375.0, 100.0],
  [425.0, 100.0],
  [475.0, 85.0],
  [525.0, 100.0],
  [575.0, 100.0],
  [626.52, 123.48],
  [650.0, 175.0],
  [650.0, 225.0],
  [630.71, 278.7],
  [671.3, 319.29],
  [725.0, 300.0],
  [775.0, 300.0],
  [826.52, 323.48],
  [850.0, 375.0],
  [850.0, 425.0],
  [865.0, 475.0],
  [850.0, 525.0],
  [850.0, 575.0],
  [826.52, 626.52],
  [775.0, 650.0],
  [725.0, 650.0],
  [671.3, 630.71],
  [630.71, 671.3],
  [650.0, 725.0],
  [650.0, 775.0],
  [626.52, 826.52],
  [575.0, 850.0],
  [525.0, 850.0],
  [475.0, 865.0],
  [425.0, 850.0],
  [375.0, 850.0],
  [323.48, 826.52],
  [300.0, 775.0],
  [300.0, 725.0],
  [319.29, 671.3],
  [278.7, 630.71],
  [225.0, 650.0],
  [175.0, 650.0],
  [123.48, 626.52],
  [100.0, 575.0],
  [100.0, 525.0],
];

export const HOME_LEN = 6;
export const FINISH_INDEX = HOME_LEN - 1;
export const TRACK_PATH_LEN = 50; // reachable outer squares per player (local 0..49)

/** Home stretch, outer (index 0, next to turning arrow) → inner finish (index 5). */
export const HOME = {
  yellow: [
    [178.7, 475.0],
    [228.7, 475.0],
    [278.7, 475.0],
    [328.7, 475.0],
    [378.7, 475.0],
    [428.7, 475.0],
  ],
  green: [
    [475.0, 178.7],
    [475.0, 228.7],
    [475.0, 278.7],
    [475.0, 328.7],
    [475.0, 378.7],
    [475.0, 428.7],
  ],
  red: [
    [771.3, 475.0],
    [721.3, 475.0],
    [671.3, 475.0],
    [621.3, 475.0],
    [571.3, 475.0],
    [521.3, 475.0],
  ],
  blue: [
    [475.0, 771.3],
    [475.0, 721.3],
    [475.0, 671.3],
    [475.0, 621.3],
    [475.0, 571.3],
    [475.0, 521.3],
  ],
};

export const HANGAR = {
  yellow: [
    [100, 100],
    [200, 100],
    [100, 200],
    [200, 200],
  ],
  green: [
    [750, 100],
    [850, 100],
    [750, 200],
    [850, 200],
  ],
  red: [
    [750, 750],
    [850, 750],
    [750, 850],
    [850, 850],
  ],
  blue: [
    [100, 750],
    [200, 750],
    [100, 850],
    [200, 850],
  ],
};

/** Distinct 起飛 triangle centres (visual launch pads next to hangars). */
export const LAUNCH_PAD = {
  yellow: [110.76, 275],
  green: [675, 110.76],
  red: [839.24, 675],
  blue: [275, 839.24],
};

export const BOARD_SIZE = 950;

export function trackColor(index) {
  return COLORS[index % 4];
}

export function localToGlobal(color, local) {
  const launch = COLOR_META[color].launch;
  return (launch + local) % 52;
}

export function globalToLocal(color, globalIndex) {
  const launch = COLOR_META[color].launch;
  return (globalIndex - launch + 52) % 52;
}

export function isOwnColorSquare(color, globalIndex) {
  return trackColor(globalIndex) === color;
}

export function isFlyStart(color, globalIndex) {
  return COLOR_META[color].flyStart === globalIndex;
}

export function pieceScreenPos(plane, color) {
  if (plane.loc === "hangar" || plane.loc === "finished") {
    return HANGAR[color][plane.slot];
  }
  if (plane.loc === "launch") {
    return LAUNCH_PAD[color];
  }
  if (plane.loc === "home") {
    return HOME[color][plane.index];
  }
  if (plane.loc === "track") {
    return TRACK[plane.index];
  }
  return [475, 475];
}

export function waypointScreenPos(wp) {
  if (wp.loc === "hangar" || wp.loc === "finished") {
    return HANGAR[wp.color][wp.slot];
  }
  if (wp.loc === "launch" || wp.kind === "takeoff") {
    return LAUNCH_PAD[wp.color];
  }
  if (wp.loc === "home") {
    return HOME[wp.color][wp.index];
  }
  if (wp.loc === "track") {
    return TRACK[wp.index];
  }
  return [475, 475];
}
