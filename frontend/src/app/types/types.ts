// プレイヤーデータ
export type Player = {
    id: string;
    x: string;
    y: string;
    // 文字列で送られてくるのでstring型
    hp: string;
    max_hp: string;
};

// 敵キャラクターデータ
export type Enemy = {
    id: string;
    name: string;
    x: string;
    y: string;
    hp: string;
    max_hp: string;
};