import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

// ⚠️ SUBSTITUA TODAS AS PROPRIEDADES ABAIXO PELAS CREDENCIAIS DO SEU CONSOLE FIREBASE
const firebaseConfig = {
    apiKey: "SUA_API_KEY",
    authDomain: "SEU_AUTH_DOMAIN",
    projectId: "SEU_PROJECT_ID",
    storageBucket: "SEU_STORAGE_BUCKET",
    messagingSenderId: "SEU_MESSAGING_SENDER_ID",
    appId: "SEU_APP_ID"
};

// Inicialização das APIs do Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentUser = null;

// Captura de Elementos do DOM
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const userInfo = document.getElementById('user-info');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');

// Listener de Autenticação - Gerencia Sessão do Usuário Ativo
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

// Manipuladores de Eventos do Painel de Autenticação
btnLogin.addEventListener('click', async () => {
    try { await signInWithPopup(auth, provider); } 
    catch (error) { console.error("Erro no fluxo de autenticação: ", error); }
});

btnLogout.addEventListener('click', () => signOut(auth));

/**
 * Motor de Inicialização Genérico do Emulador
 * Puxa os dados binários da ROM para o contexto da RAM do navegador e roda de forma isolada.
 */
window.launchGame = function(system, romUrl, gameTitle) {
    // Esconde a Dashboard e exibe a tela do emulador
    document.getElementById('catalog-screen').classList.add('hidden');
    const emuScreen = document.getElementById('emulator-screen');
    emuScreen.classList.remove('hidden');
    document.getElementById('playing-title').textContent = `Jogando: ${gameTitle}`;

    // Sanitização e limpeza de instâncias prévias do canvas do player
    document.getElementById('emulator-player').innerHTML = `<div id="game-canvas"></div>`;

    // Injeção de Parâmetros Globais requeridos na API do EmulatorJS
    window.EJS_player = '#game-canvas';
    window.EJS_core = system; // Seta o identificador exato do core (ex: segaMD, snes, gba)
    window.EJS_gameUrl = romUrl; // Atribui a rota binária ou Blob URL local
    window.EJS_pathtodata = 'https://cdn.emulatorjs.org/latest/data/'; // CDN estável que serve os cores compilation (WebAssembly)

    // Injeção assíncrona do script Loader oficial do ecossistema EmulatorJS
    const script = document.createElement('script');
    script.src = 'https://cdn.emulatorjs.org/latest/data/loader.js';
    document.getElementById('emulator-player').appendChild(script);

    // Callback síncrono disparado no carregamento da rom para restaurar save states antigos do Firebase
    window.EJS_onLogin = async function() {
        if (!currentUser) return;
        // Sanitiza a chave de registro do documento removendo caracteres especiais impeditivos
        const sanitizedTitle = gameTitle.replace(/[^a-zA-Z0-9]/g, "_");
        const saveRef = doc(db, "saves", `${currentUser.uid}_${sanitizedTitle}`);
        
        try {
            const saveSnap = await getDoc(saveRef);
            if (saveSnap.exists()) {
                // Injeta os bytes salvos diretamente de volta na alocação de RAM do WebAssembly
                window.EJS_LoadState(new Uint8Array(saveSnap.data().bytes));
                console.log("Save state restaurado com sucesso via Cloud!");
            }
        } catch (err) {
            console.error("Falha ao ler save do Firebase:", err);
        }
    };

    // Interceptador disparado pela engine do emulador no evento de escrita de Save State do Usuário
    window.EJS_onSaveState = async function(data) {
        if (!currentUser) {
            alert("Faça login com a sua conta Google para salvar o progresso do jogo na nuvem!");
            return;
        }
        
        const sanitizedTitle = gameTitle.replace(/[^a-zA-Z0-9]/g, "_");
        const saveRef = doc(db, "saves", `${currentUser.uid}_${sanitizedTitle}`);
        
        try {
            // Empacota o buffer binário puro da RAM em formato array nativo legível para o Firestore
            await setDoc(saveRef, {
                bytes: Array.from(data),
                updatedAt: new Date()
            });
            console.log("Estado de persistência gravado com sucesso no Firebase!");
        } catch (err) {
            console.error("Erro na gravação do save state na nuvem:", err);
        }
    };
};

/**
 * Função de Processamento para Upload de Arquivos de ROM Locais
 * Intercepta o arquivo local através da API FileReader e aloca na memória interna através de uma Blob URL
 */
window.uploadAndPlay = function() {
    const fileInput = document.getElementById('rom-upload');
    let system = document.getElementById('system-select').value;
    
    if (fileInput.files.length === 0) {
        alert("Por favor, selecione um arquivo de ROM primeiro clicando no botão apropriado!");
        return;
    }

    const file = fileInput.files[0];
    const extension = file.name.split('.').pop().toLowerCase();

    // Sistema inteligente de Auto-Correção e Suporte para Extensões Alternativas (.smd, .sms, .gen)
    if (extension === 'smd' || extension === 'gen' || extension === 'md') {
        system = 'segaMD'; // Redireciona forçado para o Core estável correto do Mega Drive
    } else if (extension === 'sms') {
        system = 'mastersystem'; // Força o core do Master System se o arquivo for .sms
    }

    // Cria uma URL virtual estática temporária apontando de volta para a RAM local do dispositivo do cliente
    const localRomUrl = URL.createObjectURL(file);

    // Aciona a rotina padrão do emulador passando a referência virtual da RAM
    launchGame(system, localRomUrl, file.name);
};

/**
 * Finaliza a execução do Core e retorna o usuário de volta à tela de seleção principal
 */
window.closeEmulator = function() {
    document.getElementById('emulator-screen').classList.add('hidden');
    document.getElementById('catalog-screen').classList.remove('hidden');
    // Limpa a árvore interna limpando a memória RAM usada pelo WebAssembly
    document.getElementById('emulator-player').innerHTML = '';
};
