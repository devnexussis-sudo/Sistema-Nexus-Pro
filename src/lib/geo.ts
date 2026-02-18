
export interface GeoLocation {
    lat: number;
    lng: number;
    accuracy?: number;
    timestamp: string;
}

export const GeoService = {
    getCurrentPosition: async (): Promise<GeoLocation> => {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error("Geolocalização não suportada no navegador."));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: new Date(position.timestamp).toISOString()
                    });
                },
                (error) => {
                    let message = "Erro ao obter localização.";
                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            message = "Permissão de localização negada. Habilite o GPS nas configurações.";
                            break;
                        case error.POSITION_UNAVAILABLE:
                            message = "Sinal de GPS indisponível. Vá para uma área aberta.";
                            break;
                        case error.TIMEOUT:
                            message = "Tempo esgotado ao obter localização. Tente novamente.";
                            break;
                    }
                    reject(new Error(message));
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        });
    }
};
