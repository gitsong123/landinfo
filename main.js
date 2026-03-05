/**
 * main.js - Firebase 인증 및 게시판 로직
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, serverTimestamp, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js";

// Firebase 설정
const firebaseConfig = {
    apiKey: "AIzaSyD_oOfSE_XM9fWNlSmwM-4WXuPJtC8Yc0w",
    authDomain: "landinfo-a1539.firebaseapp.com",
    projectId: "landinfo-a1539",
    storageBucket: "landinfo-a1539.firebasestorage.app",
    messagingSenderId: "678702308952",
    appId: "1:678702308952:web:6113a3f2ac3b61322db42d",
    measurementId: "G-QXX655RRD5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 디버깅용 로그
console.log("Firebase Initialized for project:", firebaseConfig.projectId);

/* ===================================================
   인증 관련 로직
=================================================== */

onAuthStateChanged(auth, async (user) => {
    if (user) {
        window.currentUser = user;
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.exists() ? userDoc.data() : {};
        window.currentUser.role = userData.role || 'user';

        $('#userStatus').text(`${user.displayName || user.email}님`);
        $('#loginBtn').text('로그아웃').attr('onclick', 'handleLogout()');
        
        // 글쓰기 영역 활성화 (카테고리 선택 포함)
        const isAdmin = window.currentUser.role === 'admin';
        $('#writeArea').html(`
            <div class="form-group">
                <select id="postCategory" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px; margin-bottom:8px; font-size:12px;">
                    ${isAdmin ? '<option value="intro">🎓 도시계획개론 (관리자전용)</option>' : ''}
                    <option value="free">💬 자유게시판</option>
                    <option value="qna">❓ Q&A</option>
                </select>
                <input type="text" id="postTitle" placeholder="제목을 입력하세요" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px; margin-bottom:8px;">
                <textarea id="postContent" rows="3" placeholder="내용을 입력하세요..." style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px; resize:none; font-family:inherit;"></textarea>
                <button class="btn-primary" onclick="submitPost()" style="margin-top:8px;">📝 게시글 올리기</button>
            </div>
        `);
        if (typeof window.closeModal === 'function') window.closeModal('authModal');
    } else {
        window.currentUser = null;
        $('#userStatus').text('익명 사용자');
        $('#loginBtn').text('로그인').attr('onclick', 'openLoginModal()');
        
        $('#writeArea').html(`
            <div style="text-align:center; padding:10px; background:#f9f9f9; border-radius:8px; border:1px dashed #ccc;">
                <p style="margin:0 0 8px; font-size:12px; color:#666;">글을 쓰려면 로그인이 필요합니다.</p>
                <button class="btn-primary" onclick="openLoginModal()" style="width:auto; padding:5px 15px; font-size:12px;">로그인 / 회원가입</button>
            </div>
        `);
    }
    refreshPosts();
});

window.handleAuth = async () => {
    const email = $('#authEmail').val().trim();
    const password = $('#authPassword').val().trim();
    const nick = $('#authNick').val().trim();

    if (!email || !password) { alert('이메일과 비밀번호를 입력해주세요.'); return; }
    if (window.authMode === 'register' && !nick) { alert('닉네임을 입력해주세요.'); return; }

    try {
        if (window.authMode === 'register') {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            await updateProfile(user, { displayName: nick });
            await setDoc(doc(db, "users", user.uid), {
                email: user.email,
                displayName: nick,
                role: 'user',
                createdAt: serverTimestamp()
            });
            alert('회원가입이 완료되었습니다!');
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
    } catch (error) {
        alert(`인증 오류: ${error.message}`);
    }
};

window.handleLogout = () => {
    if(confirm('로그아웃 하시겠습니까?')) {
        signOut(auth).then(() => alert('로그아웃 되었습니다.'));
    }
};

/* ===================================================
   사이드 패널 탭 전환 및 카테고리 필터
=================================================== */
window.currentCategory = 'all';

window.setCategory = (cat, btn) => {
    window.currentCategory = cat;
    if (btn) {
        $('.cat-filter').removeClass('active').css({ 'background': '#fff', 'color': '#333' });
        $(btn).addClass('active').css({ 'background': '#3a7bd5', 'color': '#fff' });
    }
    refreshPosts();
};

window.switchTab = (tab) => {
    if (tab === 'land') {
        $('#landTabContent').show();
        $('#commTabContent').hide();
        $('#tabLandBtn').css({ 'background': '#f4f6fb', 'border-bottom': '2px solid #3a7bd5', 'color': '#3a7bd5' });
        $('#tabCommBtn').css({ 'background': '#fff', 'border-bottom': 'none', 'color': '#666' });
    } else {
        $('#landTabContent').hide();
        $('#commTabContent').show();
        $('#tabCommBtn').css({ 'background': '#f4f6fb', 'border-bottom': '2px solid #3a7bd5', 'color': '#3a7bd5' });
        $('#tabLandBtn').css({ 'background': '#fff', 'border-bottom': 'none', 'color': '#666' });
        refreshPosts();
    }
};

/* ===================================================
   게시판 관련 로직
=================================================== */

window.submitPost = async () => {
    if (!window.currentUser) { alert('로그인이 필요합니다.'); openLoginModal(); return; }

    const cat = $('#postCategory').val();
    const title = $('#postTitle').val().trim();
    const content = $('#postContent').val().trim();

    if (cat === 'intro' && window.currentUser.role !== 'admin') {
        alert('도시계획개론은 관리자만 작성할 수 있습니다.');
        return;
    }

    if (!title || !content) { alert('제목과 내용을 입력해주세요.'); return; }

    try {
        await addDoc(collection(db, "posts"), {
            category: cat,
            title: title,
            content: content,
            authorId: window.currentUser.uid,
            authorName: window.currentUser.displayName || window.currentUser.email,
            createdAt: serverTimestamp()
        });
        alert('등록되었습니다.');
        $('#postTitle').val('');
        $('#postContent').val('');
        refreshPosts();
    } catch (error) {
        alert('등록 실패');
    }
};

const CAT_NAMES = { intro: '🎓 도시계획개론', free: '💬 자유게시판', qna: '❓ Q&A' };

/* HTML 특수문자 이스케이프 (XSS 방지) */
function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function refreshPosts() {
    const $listSide = $('#postListSide');
    
    try {
        let q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        $listSide.empty();

        // [도시계획개론] 기본 게시글 데이터
        const defaultIntroPost = {
            id: 'default_intro_1',
            data: {
                category: 'intro',
                title: '🎓 도시와 도시화의 이해',
                content: `🏙️ 1. 도시와 도시화\n\n1) 도시 (City)\n가. 도시의 정의\n- 인간이 창조적 지혜와 능력을 갖추고 계획을 수립하며, 끊임없이 만들어가는 장소\n- 자본과 인구가 고도로 집적된 지역\n\n나. 도시의 구성요소\n- 시민, 활동, 토지, 시설 (유기적 4대 요소)\n- Landmark, Path, Node, District, Edge (도시이미지 5요소)\n\n2) 도시화 (Urbanization)\n- 1단계: 도시화 (집중)\n- 2단계: 교외화 (분산)\n- 3단계: 반도시화 (감소)\n- 4단계: 재도시화 (회귀 및 도심 재생)\n\n※ 우리나라는 1960년대 이후 급격한 '압축 도시화'를 경험했습니다.`,
                authorName: '관리자',
                createdAt: { toDate: () => new Date('2026-03-04') }
            }
        };

        let hasIntro = false;
        const posts = [];
        querySnapshot.forEach(doc => {
            const d = doc.data();
            if (d.category === 'intro') hasIntro = true;
            posts.push({ id: doc.id, data: d });
        });

        if (!hasIntro) posts.unshift(defaultIntroPost);

        if (posts.length === 0) {
            $listSide.append('<div style="text-align:center; padding:40px; color:#aaa;">글이 없습니다.</div>');
            return;
        }

        for (const item of posts) {
            const data = item.data;
            const id = item.id;
            
            if (window.currentCategory !== 'all' && data.category !== window.currentCategory) continue;

            const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString() : '방금 전';
            const catName = CAT_NAMES[data.category] || '일반';
            
            const isAuthor = window.currentUser && window.currentUser.uid === data.authorId;
            const isAdmin = window.currentUser && window.currentUser.role === 'admin';
            
            let actionBtns = '';
            if (isAuthor || isAdmin) {
                actionBtns = `
                    <span onclick="handleEditPost('${id}')" style="color:#3a7bd5; cursor:pointer; margin-right:10px; font-size:11px;">수정</span>
                    <span onclick="handleDeletePost('${id}')" style="color:#e74c3c; cursor:pointer; font-size:11px;">삭제</span>
                `;
            }

            // 댓글 가져오기
            const comms = await getDocs(query(collection(db, `posts/${id}/comments`), orderBy("createdAt", "asc")));
            let commsHtml = '';
            comms.forEach(c => {
                const cData = c.data();
                const cId = c.id;
                const isCommentAuthor = window.currentUser && window.currentUser.uid === cData.authorId;
                
                let cActionBtns = '';
                if (isCommentAuthor || isAdmin) {
                    cActionBtns = `
                        <div style="display:flex; gap:8px; margin-left:10px;">
                            <span onclick="handleEditComment('${id}', '${cId}', '${esc(cData.content)}')" style="color:#3a7bd5; cursor:pointer; font-weight:bold;">✎</span>
                            <span onclick="handleDeleteComment('${id}', '${cId}')" style="color:#e74c3c; cursor:pointer; font-weight:bold;">×</span>
                        </div>
                    `;
                }

                commsHtml += `<div style="font-size:11px; padding:6px 0; border-top:1px dashed #eee; display:flex; justify-content:space-between; align-items:center;">
                    <div style="flex:1;"><strong style="color:#333;">${esc(cData.authorName)}:</strong> ${esc(cData.content)}</div>
                    ${cActionBtns}
                </div>`;
            });

            const postHtml = `
                <div class="post-card" style="background:#fff; border-radius:12px; margin-bottom:12px; border:1px solid #eef1f8; box-shadow:0 2px 8px rgba(0,0,0,0.04); overflow:hidden;">
                    <div onclick="togglePostContent('${id}')" style="padding:15px; cursor:pointer; background:#fff; transition:background 0.2s;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <div style="font-size:10px; color:#3a7bd5; font-weight:bold; margin-bottom:3px;">${esc(catName)}</div>
                                <div style="font-size:15px; font-weight:700; color:#333;">${esc(data.title)}</div>
                            </div>
                            <span id="arrow_${id}" style="color:#aaa; font-size:12px;">▼</span>
                        </div>
                        <div style="font-size:11px; color:#bbb; margin-top:5px;">👤 ${esc(data.authorName)} | 🕒 ${date}</div>
                    </div>

                    <div id="content_${id}" style="display:none; padding:0 15px 15px; border-top:1px solid #f9f9f9; background:#fff;">
                        <div style="font-size:13.5px; color:#555; white-space:pre-wrap; line-height:1.6; padding:15px 0;">${esc(data.content)}</div>
                        
                        <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
                            <div style="background:#fefefe; padding:2px 8px; border-radius:4px; border:1px solid #f0f0f0;">
                                ${actionBtns ? actionBtns : '<span style="color:#ccc; font-size:10px;">작성자</span>'}
                            </div>
                        </div>

                        <div id="commentSection_${id}" style="background:#f9f9f9; padding:10px; border-radius:8px;">
                            <div id="commentList_${id}">${commsHtml ? commsHtml : '<div style="font-size:10px; color:#ccc; text-align:center;">댓글이 없습니다.</div>'}</div>
                            <div style="display:flex; gap:5px; margin-top:8px;">
                                <input type="text" id="commInput_${id}" placeholder="댓글 입력..." style="flex:1; border:1px solid #ddd; border-radius:4px; padding:6px 10px; font-size:11px; outline:none;">
                                <button onclick="submitComment('${id}')" style="background:#3a7bd5; color:#fff; border:none; border-radius:4px; padding:4px 12px; font-size:11px; cursor:pointer; font-weight:bold;">등록</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            $listSide.append(postHtml);
        }
    } catch (error) { console.error(error); }
}

window.togglePostContent = (id) => {
    const $content = $(`#content_${id}`);
    const $arrow = $(`#arrow_${id}`);
    if ($content.is(':visible')) {
        $content.slideUp(200);
        $arrow.text('▼');
    } else {
        $content.slideDown(200);
        $arrow.text('▲');
    }
};

window.submitComment = async (postId) => {
    if (!window.currentUser) { alert('로그인이 필요합니다.'); return; }
    const content = $(`#commInput_${postId}`).val().trim();
    if (!content) return;

    try {
        await addDoc(collection(db, `posts/${postId}/comments`), {
            content: content,
            authorId: window.currentUser.uid,
            authorName: window.currentUser.displayName || window.currentUser.email,
            createdAt: serverTimestamp()
        });
        $(`#commInput_${postId}`).val('');
        refreshPosts();
    } catch (error) { alert('댓글 등록 실패'); }
};

window.handleEditPost = async (id) => {
    const postRef = doc(db, "posts", id);
    const snap = await getDoc(postRef);
    if (!snap.exists()) return;
    const data = snap.data();

    const newTitle = prompt('새 제목을 입력하세요:', data.title);
    if (newTitle === null) return;
    const newContent = prompt('새 내용을 입력하세요:', data.content);
    if (newContent === null) return;

    try {
        await updateDoc(postRef, {
            title: newTitle,
            content: newContent,
            updatedAt: serverTimestamp()
        });
        refreshPosts();
    } catch (error) {
        alert('수정 권한이 없습니다.');
    }
};

window.handleDeletePost = async (id) => {
    if (!confirm('게시글을 삭제하시겠습니까?')) return;
    try {
        await deleteDoc(doc(db, "posts", id));
        refreshPosts();
    } catch (error) {
        alert('삭제 권한이 없습니다.');
    }
};

window.handleEditComment = async (postId, commentId, oldContent) => {
    const newContent = prompt('댓글을 수정하세요:', oldContent);
    if (newContent === null || newContent.trim() === '' || newContent === oldContent) return;

    try {
        await updateDoc(doc(db, `posts/${postId}/comments`, commentId), {
            content: newContent,
            updatedAt: serverTimestamp()
        });
        refreshPosts();
    } catch (error) {
        alert('수정 권한이 없습니다.');
    }
};

window.handleDeleteComment = async (postId, commentId) => {
    if (!confirm('댓글을 삭제하시겠습니까?')) return;
    try {
        await deleteDoc(doc(db, `posts/${postId}/comments`, commentId));
        refreshPosts();
    } catch (error) {
        console.error(error);
        alert('삭제 권한이 없거나 오류가 발생했습니다.');
    }
};

window.addEventListener('refreshPosts', refreshPosts);
refreshPosts();

$(document).ready(() => {
    switchTab('land');
});
