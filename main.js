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
    window.currentUser = user;
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.exists() ? userDoc.data() : {};
        window.currentUser.role = userData.role || 'user';

        $('#userStatus').text(`${user.displayName || user.email}님`);
        $('#loginBtn').text('로그아웃').attr('onclick', 'handleLogout()');
        if (typeof window.closeModal === 'function') window.closeModal('authModal');
    } else {
        $('#userStatus').text('익명 사용자');
        $('#loginBtn').text('로그인').attr('onclick', 'openLoginModal()');
    }
    updateWriteArea();
    refreshPosts();
});

window.updateWriteArea = () => {
    const user = window.currentUser;
    let cat = window.currentCategory === 'all' ? 'free' : window.currentCategory;
    const isAdmin = user && user.role === 'admin';
    
    // 비로그인 상태에서 글쓰기를 누르면 기본적으로 익명게시판으로 유도
    if (!user && cat !== 'anon') {
        cat = 'anon';
    }

    const isAnonCategory = cat === 'anon';

    if (!user && !isAnonCategory) {
        $('#writeArea').html(`
            <div style="text-align:center; padding:10px; background:#f9f9f9; border-radius:8px; border:1px dashed #ccc;">
                <p style="margin:0 0 8px; font-size:12px; color:#666;">글을 쓰려면 로그인이 필요합니다.</p>
                <div style="display:flex; gap:5px; justify-content:center;">
                    <button class="btn-primary" onclick="openLoginModal()" style="width:auto; padding:5px 15px; font-size:12px;">로그인 / 회원가입</button>
                    <button class="btn-primary" onclick="setCategory('anon')" style="width:auto; padding:5px 15px; font-size:12px; background:#666;">👻 익명으로 쓰기</button>
                </div>
            </div>
        `);
        return;
    }

    // 익명게시판 혹은 로그인한 경우 글쓰기 폼 표시
    $('#writeArea').html(`
        <div class="form-group">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-size:12px; font-weight:bold; color:#3a7bd5;">📝 글쓰기 (${CAT_NAMES[cat] || '일반'})</span>
                <button onclick="toggleWriteForm()" style="background:none; border:none; color:#999; cursor:pointer; font-size:14px;">✕</button>
            </div>
            <select id="postCategory" onchange="updateWriteAreaForCategory(this.value)" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px; margin-bottom:8px; font-size:12px;">
                ${isAdmin ? `<option value="intro" ${cat === 'intro' ? 'selected' : ''}>🎓 도시계획개론 (관리자전용)</option>` : ''}
                <option value="free" ${cat === 'free' ? 'selected' : ''}>💬 자유게시판</option>
                <option value="qna" ${cat === 'qna' ? 'selected' : ''}>❓ Q&A</option>
                <option value="anon" ${cat === 'anon' ? 'selected' : ''}>👻 익명게시판</option>
            </select>
            ${!user ? `<input type="text" id="postAnonNick" placeholder="닉네임 (익명)" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px; margin-bottom:8px;">` : ''}
            <input type="text" id="postTitle" placeholder="제목을 입력하세요" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px; margin-bottom:8px;">
            <textarea id="postContent" rows="3" placeholder="내용을 입력하세요..." style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px; resize:none; font-family:inherit;"></textarea>
            <button class="btn-primary" onclick="submitPost()" style="margin-top:8px; width:100%;">📝 게시글 올리기</button>
        </div>
    `);
};

// 카테고리 선택 변경 시 즉시 UI 갱신 (익명 닉네임 필드 노출 제어용)
window.updateWriteAreaForCategory = (cat) => {
    window.currentCategory = cat;
    updateWriteArea();
};

window.toggleWriteForm = () => {
    const $wa = $('#writeArea');
    if ($wa.is(':visible')) {
        $wa.slideUp(200);
    } else {
        updateWriteArea();
        $wa.slideDown(200);
    }
};

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
window.currentCategory = 'intro';

window.setCategory = (cat, btn) => {
    window.currentCategory = cat;
    
    // 모든 버튼에서 active 클래스 제거
    $('.cat-filter').removeClass('active');

    if (btn) {
        $(btn).addClass('active');
    } else {
        // 버튼 객체 없이 호출된 경우 (예: '익명으로 쓰기' 버튼 클릭 등)
        // cat 파라미터와 정확히 일치하는 버튼을 찾아 활성화
        $(`.cat-filter[onclick*="'${cat}'"]`).addClass('active');
    }
    updateWriteArea();
    refreshPosts();
};

window.switchTab = (tab) => {
    const isSmallScreen = window.innerWidth <= 768;
    const $sidePanel = $('#sidePanel');
    const $commTabContent = $('#commTabContent');
    const $priceTabContent = $('#priceTabContent');
    const $landTabContent = $('#landTabContent');
    const $mapArea = $('.map-area');
    const $mapPriceContainer = $('#mapPriceContainer');

    // 탭 버튼 스타일 초기화
    $('.active-tab').removeClass('active-tab').css({ 'background': '#fff', 'border-bottom': 'none', 'color': '#666' });

    if (tab === 'land') {
        $landTabContent.css('display', 'flex');
        $commTabContent.css('display', 'none').removeClass('comm-slide-up');
        $priceTabContent.css('display', 'none');
        $mapPriceContainer.fadeOut(300); // 지도보기로 전환 시 웹 계산기 숨김
        $('#tabLandBtn').css({ 'background': '#f4f6fb', 'border-bottom': '2px solid #3a7bd5', 'color': '#3a7bd5' }).addClass('active-tab');
        $('#sheetPullLabel').text('토지정보를 클릭하여 조회하세요');

        if (isSmallScreen) {
            $sidePanel.removeClass('side-comm-expanded');
            $sidePanel.css({ 'top': '55dvh', 'height': '45dvh' });
            if ($sidePanel.hasClass('sheet-collapsed')) {
                $mapArea.css("height", "calc(100dvh - 44px)");
            } else {
                $mapArea.css("height", "55dvh");
            }
        } else {
            // 웹(데스크탑) 리셋
            $sidePanel.css({ 'top': '0', 'height': '100vh' });
            $mapArea.css("height", "100vh");
        }
    } else if (tab === 'comm') {
        $landTabContent.css('display', 'none');
        $commTabContent.css('display', 'flex').addClass('comm-slide-up');
        $priceTabContent.css('display', 'none');
        $mapPriceContainer.fadeOut(300);
        $('#tabCommBtn').css({ 'background': '#f4f6fb', 'border-bottom': '2px solid #3a7bd5', 'color': '#3a7bd5' }).addClass('active-tab');
        $('#sheetPullLabel').text('💬 커뮤니티 게시판');

        // 웹 브라우저도 화면이 작으면 모바일처럼 슬라이드업
        if (isSmallScreen) {
            $sidePanel.addClass('side-comm-expanded').removeClass('sheet-collapsed');
            $sidePanel.css({ 'top': '0', 'height': '100dvh' });
            $("#sheetPullToggle").text("▼");
            $mapArea.css("height", "0");
        } else {
            // 데스크탑 모드: 패널 크기 고정 (기본 CSS에 따름)
            $sidePanel.removeClass('side-comm-expanded');
            $sidePanel.css({ 'top': '0', 'height': '100vh' });
            $mapArea.css("height", "100vh");
        }

        $('#commSearchInput').off('keypress').on('keypress', (e) => {
            if (e.which === 13) refreshPosts();
        });

        updateWriteArea();
        refreshPosts();
    } else if (tab === 'price') {
        // 모든 탭 컨텐츠 숨기기
        $landTabContent.hide();
        $commTabContent.hide();
        $priceTabContent.hide();
        $('#sheetPullLabel').text('🧮 품셈계산기');

        if (!isSmallScreen) {
            // 웹(데스크탑): 지도영역에 품셈계산기 표시
            $landTabContent.show(); // 배경은 토지정보 탭 유지 (사이드바)
            $mapPriceContainer.css('display', 'flex').hide().fadeIn(300);
            if ($('#mapPriceIframe').attr('src') === 'about:blank') {
                $('#mapPriceIframe').attr('src', 'price_ver2.html');
            }
            // 탭 활성화 UI 업데이트
            $('#tabPriceBtn').css({ 'background': '#f4f6fb', 'border-bottom': '2px solid #3a7bd5', 'color': '#3a7bd5' }).addClass('active-tab');
        } else {
            // 모바일: 사이드 패널 내에서 슬라이드업 (전체화면)
            $priceTabContent.css('display', 'flex');
            $('.price-mobile-ctrl').css('display', 'flex');
            $('#tabPriceBtn').css({ 'background': '#f4f6fb', 'border-bottom': '2px solid #3a7bd5', 'color': '#3a7bd5' }).addClass('active-tab');

            if ($('#priceIframe').attr('src') === 'about:blank') {
                $('#priceIframe').attr('src', 'price_ver2.html');
            }

            $sidePanel.addClass('side-comm-expanded').removeClass('sheet-collapsed');
            $sidePanel.css({ 'top': '0', 'height': '100dvh' });
            $("#sheetPullToggle").text("▼");
            $mapArea.css("height", "0");
        }
    }
    // 지도 크기 업데이트
    setTimeout(() => { if(window.map2d) window.map2d.updateSize(); }, 450);
};

// 웹 품셈계산기 닫기 (지도보기 전환)
window.closeMapPrice = () => {
    switchTab('land');
};
/* ===================================================
   게시판 관련 로직
=================================================== */

window.submitPost = async () => {
    const user = window.currentUser;
    const cat = $('#postCategory').val();
    const title = $('#postTitle').val().trim();
    const content = $('#postContent').val().trim();
    const anonNick = $('#postAnonNick').val() ? $('#postAnonNick').val().trim() : '';

    if (!user && cat !== 'anon') { 
        alert('로그인이 필요합니다.'); 
        openLoginModal(); 
        return; 
    }

    if (cat === 'intro' && (!user || user.role !== 'admin')) {
        alert('도시계획개론은 관리자만 작성할 수 있습니다.');
        return;
    }

    if (!title || !content) { alert('제목과 내용을 입력해주세요.'); return; }
    if (cat === 'anon' && !user && !anonNick) { alert('닉네임을 입력해주세요.'); return; }

    try {
        await addDoc(collection(db, "posts"), {
            category: cat,
            title: title,
            content: content,
            authorId: user ? user.uid : 'anonymous',
            authorName: user ? (user.displayName || user.email) : (anonNick || '익명'),
            createdAt: serverTimestamp()
        });
        alert('등록되었습니다.');
        $('#postTitle').val('');
        $('#postContent').val('');
        $('#postAnonNick').val('');
        $('#writeArea').slideUp(200);
        refreshPosts();
    } catch (error) {
        alert('등록 실패');
    }
};

const CAT_NAMES = { intro: '🎓 도시계획개론', free: '💬 자유게시판', qna: '❓ Q&A', anon: '👻 익명게시판', gosi: '📜 결정고시' };

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
    const searchTerm = $('#commSearchInput').val() ? $('#commSearchInput').val().trim().toLowerCase() : '';
    
    try {
        let q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        $listSide.empty();

        const posts = [];
        querySnapshot.forEach(doc => {
            const d = doc.data();
            posts.push({ id: doc.id, data: d });
        });

        if (posts.length === 0) {
            $listSide.append('<div style="text-align:center; padding:40px; color:#aaa;">글이 없습니다.</div>');
            return;
        }

        let displayedCount = 0;
        for (const item of posts) {
            const data = item.data;
            const id = item.id;
            
            if (window.currentCategory !== 'all' && data.category !== window.currentCategory) continue;

            // 검색 필터링
            if (searchTerm && !(data.title.toLowerCase().includes(searchTerm) || data.content.toLowerCase().includes(searchTerm))) {
                continue;
            }

            displayedCount++;

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

            // 링크 감지 및 <a> 태그 변환 + 볼드 처리
            const contentHtml = esc(data.content)
                .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:#3a7bd5; text-decoration:underline;">$1</a>')
                .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
            
            // 제목 보정: [결정고시] 텍스트 제거
            let displayTitle = data.title;
            if (data.category === 'gosi') {
                displayTitle = displayTitle.replace('[결정고시]', '').trim();
            }

            // 제목 글자수에 따른 폰트 크기 조절
            const titleFontSize = displayTitle.length > 25 ? '14px' : '16px';

            const postHtml = `
                <div class="post-card" style="background:#fff; border-radius:16px; margin-bottom:16px; border:1px solid #eef1f8; box-shadow:0 10px 25px rgba(58,123,213,0.08); overflow:hidden; transition: transform 0.2s;">
                    <div onclick="togglePostContent('${id}')" style="padding:18px; cursor:pointer; background:#fff; transition:background 0.2s;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div style="flex:1;">
                                <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
                                    <span style="font-size:10px; padding:2px 8px; background:#eef4ff; color:#3a7bd5; border-radius:10px; font-weight:bold;">${esc(catName)}</span>
                                    <span style="font-size:11px; color:#bbb;">🕒 ${date}</span>
                                </div>
                                <div style="font-size:${titleFontSize}; font-weight:800; color:#1a1a2e; line-height:1.4;">${esc(displayTitle)}</div>
                            </div>
                            <span id="arrow_${id}" style="color:#3a7bd5; font-size:14px; background:#f4f6fb; width:24px; height:24px; display:flex; align-items:center; justify-content:center; border-radius:50%; margin-left:10px;">▼</span>
                        </div>
                        <div style="font-size:12px; color:#777; margin-top:8px; display:flex; align-items:center; gap:4px;">
                            <div style="width:20px; height:20px; background:#ddd; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; color:#fff;">👤</div>
                            <span style="font-weight:600;">${esc(data.authorName)}</span>
                        </div>
                    </div>

                    <div id="content_${id}" style="display:none; padding:0 18px 18px; border-top:1px solid #f9f9f9; background:#fff;">
                        <div style="font-size:14.5px; color:#444; white-space:pre-wrap; line-height:1.7; padding:15px 0; word-break:break-all;">${contentHtml}</div>
                        
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                            <button onclick="togglePostContent('${id}')" style="background:#f4f6fb; border:1px solid #eef1f8; color:#3a7bd5; padding:5px 12px; border-radius:6px; font-size:11px; cursor:pointer; font-weight:bold;">▲ 접기</button>
                            <div style="background:#fefefe; padding:4px 12px; border-radius:8px; border:1px solid #f0f0f0; display:flex; gap:10px;">
                                ${actionBtns ? actionBtns : '<span style="color:#ccc; font-size:11px;">관리 권한 없음</span>'}
                            </div>
                        </div>

                        <div id="commentSection_${id}" style="background:#f9f9fb; padding:15px; border-radius:12px; border:1px solid #f0f0f5;">
                            <div style="font-size:12px; font-weight:bold; color:#333; margin-bottom:12px; display:flex; align-items:center; gap:5px;">
                                💬 댓글 <span style="background:#3a7bd5; color:#fff; padding:1px 6px; border-radius:10px; font-size:10px;">${comms.size}</span>
                            </div>
                            <div id="commentList_${id}">${commsHtml ? commsHtml : '<div style="font-size:11px; color:#ccc; text-align:center; padding:10px 0;">첫 댓글을 남겨보세요!</div>'}</div>
                            <div style="display:flex; gap:8px; margin-top:12px;">
                                <input type="text" id="commInput_${id}" placeholder="따뜻한 댓글을 남겨주세요..." style="flex:1; border:1px solid #e0e4f0; border-radius:8px; padding:10px 12px; font-size:12px; outline:none; background:#fff;">
                                <button onclick="submitComment('${id}')" style="background:#3a7bd5; color:#fff; border:none; border-radius:8px; padding:0 18px; font-size:12px; cursor:pointer; font-weight:bold; transition:all 0.2s;">등록</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            $listSide.append(postHtml);
        }

        if (displayedCount === 0 && searchTerm) {
            $listSide.append('<div style="text-align:center; padding:40px; color:#aaa;">검색 결과가 없습니다.</div>');
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
