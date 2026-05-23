import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

// ⚠️ COLE AS CREDENCIAIS DA SUA CONTA FIREBASE AQUI
const firebaseConfig = {
    apiKey: "SUA_API_KEY",
    authDomain: "SEU_AUTH_DOMAIN",
    projectId: "SEU_PROJECT_ID",
    storageBucket: "SEU_STORAGE_BUCKET",
    messagingSenderId: "SEU_MESSAGING_SENDER_ID",
    appId: "SEU_APP_ID"
};

// Inicializações
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentUser = null;

// Elementos DOM
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const userInfo = document.getElementById('user-info');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');

// Monitorar Estado de Autenticação do Usuário
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        btnLogin.classList.add('hidden');
        userInfo.classList.remove('hidden');
        userAvatar.src = user.photoURL;
        userName.textContent = user.displayName.split(' ')[0];
    } else {
        currentUser = null;
        btnLogin.classList.remove('hidden');
        userInfo.classList.add('hidden');
    }
});

// Ações de Login / Logout
btnLogin.addEventListener('click', async () => {
    try { await signInWithPopup(auth, provider); } 
    catch (error) { console.error("Erro ao logar: ", error); }
});

btnLogout.addEventListener('click', () => signOut(auth));

// Função Global para Abrir Emulador (Roda Multi-plataformas puxando a ROM para a RAM)
window.launchGame = function(system, romUrl, gameTitle) {
    document.getElementById('catalog-screen').classList.add('hidden');
    const emuScreen = document.getElementById('emulator-screen');
    emuScreen.classList.remove('hidden');
    document.getElementById('playing-title').textContent = `Jogando: ${gameTitle}`;

    // Configuração dinâmica do Motor EmulatorJS (Seta o Core conforme a plataforma)
    // O core identifica se é snes, gba, megadrive, nes, gbc etc.
    let systemCore = system.toLowerCase();

    // Limpa player anterior se houver
    document.getElementById('emulator-player').innerHTML = `<div id="game-canvas"></div>`;

    // Parâmetros obrigatórios injetados na janela global do EmulatorJS
    window.EJS_player = '#game-canvas';
    window.EJS_core = systemCore;
    window.EJS_gameUrl = romUrl; // Baixa via fetch nativo para a RAM
    window.EJS_pathtodata = 'https://cdn.emulatorjs.org/latest/data/'; // CDN estável dos engines

    // Scripts do Emulador injetados dinamicamente
    const script = document.createElement('script');
    script.src = 'https://cdn.emulatorjs.org/latest/data/loader.js';
    document.getElementById('emulator-player').appendChild(script);

    // Monitoramento do ciclo para resgatar saves do Firebase automaticamente
    window.EJS_onLogin = async function() {
        if (!currentUser) return;
        const saveRef = doc(db, "saves", `${currentUser.uid}_${gameTitle}`);
        const saveSnap = await getDoc(saveRef);
        if (saveSnap.exists()) {
            // Se o Firebase tiver o saveState, injeta na RAM do player
            window.EJS_LoadState(new Uint8Array(saveSnap.data().bytes));
        }
    };

    // Função de escuta para capturar quando o jogador salvar o game
    window.EJS_onSaveState = async function(data) {
        if (!currentUser) {
            alert("Faça login com o Google para guardar o progresso na nuvem!");
            return;
        }
        // Converte o arquivo gerado na RAM em Array normal e envia ao Firestore
        const saveRef = doc(db, "saves", `${currentUser.uid}_${gameTitle}`);
        await setDoc(saveRef, {
            bytes: Array.from(data),
            updatedAt: new Date()
        });
        console.log("Progresso salvo no Firebase!");
    };
};

// Voltar para a Home
window.closeEmulator = function() {
    document.getElementById('emulator-screen').classList.add('hidden');
    document.getElementById('catalog-screen').classList.remove('hidden');
    document.getElementById('emulator-player').innerHTML = '';
};
