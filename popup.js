document.addEventListener('DOMContentLoaded', () => {
    // Referências aos elementos do DOM
    const searchInput = document.getElementById('search-input');
    const addCurrentPageBtn = document.getElementById('add-current-page-btn');
    const addFolderBtn = document.getElementById('add-folder-btn');
    const bookmarksList = document.getElementById('bookmarks-list');
    
    // Configurações
    const settingsBtn = document.getElementById('settings-btn');
    const settingsMenu = document.getElementById('settings-menu');
    const exportBtn = document.getElementById('export-btn');
    const importBtn = document.getElementById('import-btn');
    const importFileInput = document.getElementById('import-file-input');
    
    // Ordenação
    const sortContainer = document.querySelector('.sort-options');

    // Modal
    const editModal = document.getElementById('edit-modal');
    const modalTitle = document.getElementById('modal-title');
    const closeBtn = document.querySelector('.modal .close-btn');
    const saveEditBtn = document.getElementById('save-edit-btn');
    const editId = document.getElementById('edit-id');
    const editType = document.getElementById('edit-type');
    const editName = document.getElementById('edit-name');
    const editUrl = document.getElementById('edit-url');
    const urlFormGroup = document.getElementById('url-form-group');

    // Estado da aplicação
    let data = {
        items: [],
        sort: 'manual' // 'manual', 'name', 'date'
    };
    let draggedItem = null;

    // --- FUNÇÕES DE ARMAZENAMENTO ---
    const saveData = () => {
        chrome.storage.local.set({ bookmarkManagerData: data }, () => {
            console.log('Dados salvos.');
        });
    };

    const loadData = () => {
        chrome.storage.local.get('bookmarkManagerData', (result) => {
            if (result.bookmarkManagerData && result.bookmarkManagerData.items) {
                data = result.bookmarkManagerData;
            } else {
                // Dados iniciais se for a primeira vez
                data = {
                    items: [
                        { id: Date.now(), type: 'bookmark', name: 'Google', url: 'https://google.com', parentId: null, dateAdded: Date.now() }
                    ],
                    sort: 'manual'
                };
            }
            renderBookmarks();
            updateActiveSortButton();
        });
    };

    // --- FUNÇÕES DE RENDERIZAÇÃO ---
    const getFaviconUrl = (url) => {
        try {
            const urlObject = new URL(url);
            return `https://www.google.com/s2/favicons?sz=16&domain_url=${urlObject.origin}`;
        } catch (e) {
            return 'images/icon16.png'; // Ícone padrão
        }
    };

    const renderBookmarks = (searchTerm = '') => {
        bookmarksList.innerHTML = '';
        const lowerCaseSearchTerm = searchTerm.toLowerCase();

        const filteredItems = data.items.filter(item => 
            item.name.toLowerCase().includes(lowerCaseSearchTerm) ||
            (item.url && item.url.toLowerCase().includes(lowerCaseSearchTerm))
        );

        // Clona os itens para não modificar o array original durante a ordenação
        let itemsToRender = [...data.items];
        
        // Aplica a ordenação
        if (data.sort === 'name') {
            itemsToRender.sort((a, b) => a.name.localeCompare(b.name));
        } else if (data.sort === 'date') {
            itemsToRender.sort((a, b) => b.dateAdded - a.dateAdded);
        }
        // Se for 'manual', a ordem do array já está correta

        const createItemElement = (item) => {
            if (searchTerm && !filteredItems.find(f => f.id === item.id)) {
                return null;
            }

            const isFolder = item.type === 'folder';
            const li = document.createElement('li');
            li.className = isFolder ? 'folder-item' : 'bookmark-item';
            li.dataset.id = item.id;
            li.draggable = true;

            const iconSrc = isFolder ? 'images/folder.png' : getFaviconUrl(item.url);
            
            li.innerHTML = `
                <img src="${iconSrc}" class="item-icon" alt="${isFolder ? 'Pasta' : 'Favicon'}">
                <a href="${isFolder ? '#' : item.url}" target="${isFolder ? '' : '_blank'}" class="item-name">${item.name}</a>
                <div class="item-actions">
                    <button class="action-btn edit-btn" title="Editar">✏️</button>
                    <button class="action-btn delete-btn" title="Excluir">🗑️</button>
                </div>
            `;

            // Event Listeners para ações
            li.querySelector('.edit-btn').addEventListener('click', () => openEditModal(item.id));
            li.querySelector('.delete-btn').addEventListener('click', () => deleteItem(item.id));
            
            // Event Listeners para Drag & Drop
            li.addEventListener('dragstart', handleDragStart);
            li.addEventListener('dragover', handleDragOver);
            li.addEventListener('dragleave', handleDragLeave);
            li.addEventListener('drop', handleDrop);
            li.addEventListener('dragend', handleDragEnd);

            return li;
        };
        
        const buildTree = (parentId = null) => {
            const container = document.createElement('ul');
            container.className = parentId ? 'folder-content' : '';
            
            itemsToRender
                .filter(item => item.parentId === parentId)
                .forEach(item => {
                    const itemEl = createItemElement(item);
                    if (itemEl) {
                        container.appendChild(itemEl);
                        if (item.type === 'folder') {
                             const childrenContainer = buildTree(item.id);
                             if (childrenContainer.hasChildNodes()) {
                                itemEl.appendChild(childrenContainer);
                             }
                        }
                    }
                });
            return container;
        };

        const tree = buildTree();
        while(tree.firstChild) {
            bookmarksList.appendChild(tree.firstChild);
        }
    };
    
    // --- LÓGICA DE NEGÓCIOS (CRUD) ---

    const addItem = (type, name, url = '', parentId = null) => {
        const newItem = {
            id: Date.now(),
            type,
            name,
            url,
            parentId,
            dateAdded: Date.now()
        };
        data.items.push(newItem);
        saveData();
        renderBookmarks(searchInput.value);
    };

    const addCurrentPage = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                const { title, url } = tabs[0];
                addItem('bookmark', title, url);
            }
        });
    };

    const addFolder = () => {
        const folderName = prompt('Digite o nome da nova pasta:', 'Nova Pasta');
        if (folderName) {
            addItem('folder', folderName);
        }
    };

    const deleteItem = (id) => {
        if (!confirm('Tem certeza que deseja excluir este item?')) return;
        
        const idsToDelete = new Set([id]);
        const findChildren = (parentId) => {
            data.items.forEach(item => {
                if(item.parentId === parentId) {
                    idsToDelete.add(item.id);
                    if(item.type === 'folder') {
                        findChildren(item.id);
                    }
                }
            });
        };

        const itemToDelete = data.items.find(item => item.id === id);
        if (itemToDelete.type === 'folder') {
            findChildren(id);
        }

        data.items = data.items.filter(item => !idsToDelete.has(item.id));
        saveData();
        renderBookmarks(searchInput.value);
    };

    // --- MODAL ---
    const openEditModal = (id) => {
        const item = data.items.find(i => i.id === id);
        if (!item) return;

        editId.value = item.id;
        editType.value = item.type;
        editName.value = item.name;

        if (item.type === 'bookmark') {
            modalTitle.textContent = 'Editar Favorito';
            editUrl.value = item.url;
            urlFormGroup.style.display = 'block';
        } else {
            modalTitle.textContent = 'Renomear Pasta';
            urlFormGroup.style.display = 'none';
        }
        editModal.style.display = 'block';
    };

    const closeEditModal = () => {
        editModal.style.display = 'none';
    };

    const saveEdit = () => {
        const id = parseInt(editId.value);
        const item = data.items.find(i => i.id === id);
        if (!item) return;

        item.name = editName.value.trim();
        if (item.type === 'bookmark') {
            item.url = editUrl.value.trim();
        }

        saveData();
        renderBookmarks(searchInput.value);
        closeEditModal();
    };

    // --- DRAG & DROP ---
    function handleDragStart(e) {
        draggedItem = this;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.innerHTML);
        setTimeout(() => this.classList.add('dragging'), 0);
    }
    
    function handleDragEnd() {
        this.classList.remove('dragging');
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        draggedItem = null;
    }

    function handleDragOver(e) {
        e.preventDefault();
        this.classList.add('drag-over');
    }
    
    function handleDragLeave() {
        this.classList.remove('drag-over');
    }

    function handleDrop(e) {
        e.stopPropagation(); // Previne que eventos parentes sejam executados
        
        if (draggedItem !== this) {
            const draggedId = parseInt(draggedItem.dataset.id);
            const targetId = parseInt(this.dataset.id);

            const dragged = data.items.find(i => i.id === draggedId);
            const target = data.items.find(i => i.id === targetId);
            
            if(target.type === 'folder') {
                // Mover para dentro da pasta
                 dragged.parentId = target.id;
            } else {
                 // Reordenar na mesma lista
                const draggedIndex = data.items.findIndex(i => i.id === draggedId);
                const targetIndex = data.items.findIndex(i => i.id === targetId);

                // Remove o item arrastado
                const [movedItem] = data.items.splice(draggedIndex, 1);
                // Insere na nova posição
                data.items.splice(targetIndex, 0, movedItem);
                 // Garante que o parentId está correto
                movedItem.parentId = target.parentId;
            }
            
            data.sort = 'manual';
            updateActiveSortButton();
            saveData();
            renderBookmarks(searchInput.value);
        }
        this.classList.remove('drag-over');
    }

    // --- IMPORTAÇÃO / EXPORTAÇÃO ---
    const exportData = () => {
        const dataStr = JSON.stringify(data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'favoritos_backup.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const importData = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Limpa o valor para que o mesmo arquivo possa ser selecionado novamente
        event.target.value = '';

        if (file.name.endsWith('.json')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importedData = JSON.parse(e.target.result);
                    if (importedData && Array.isArray(importedData.items)) {
                        if (confirm('Isso substituirá todos os seus favoritos atuais. Deseja continuar?')) {
                            data = importedData;
                            saveData();
                            renderBookmarks();
                            updateActiveSortButton();
                        }
                    } else {
                        alert('Arquivo de importação inválido.');
                    }
                } catch (error) {
                    alert('Erro ao ler o arquivo. Certifique-se de que é um JSON válido.');
                }
            };
            reader.readAsText(file);
        } else if (file.name.endsWith('.html')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(e.target.result, "text/html");
                    const newItems = [];
                    const idSet = new Set(); // Para garantir IDs únicos

                    const parseDl = (dlElement, parentId) => {
                        if (!dlElement) return;
                        
                        // Itera sobre os filhos diretos do elemento DL
                        for (const child of Array.from(dlElement.children)) {
                            if (child.tagName !== 'DT') continue;

                            const folderHeader = child.querySelector('H3');
                            const bookmarkLink = child.querySelector('A');
                            
                            let dateAdded = Date.now();
                            if(folderHeader && folderHeader.getAttribute('ADD_DATE')) {
                                dateAdded = parseInt(folderHeader.getAttribute('ADD_DATE'), 10) * 1000;
                            } else if (bookmarkLink && bookmarkLink.getAttribute('ADD_DATE')) {
                                dateAdded = parseInt(bookmarkLink.getAttribute('ADD_DATE'), 10) * 1000;
                            }
                            
                            let uniqueId = dateAdded;
                            while(idSet.has(uniqueId)) {
                                uniqueId++; // Garante ID único se houver colisões de timestamp
                            }
                            idSet.add(uniqueId);

                            if (folderHeader) {
                                const newFolder = {
                                    id: uniqueId,
                                    type: 'folder',
                                    name: folderHeader.textContent.trim(),
                                    parentId: parentId,
                                    dateAdded: dateAdded,
                                    url: ''
                                };
                                newItems.push(newFolder);
                                
                                const nextDl = child.nextElementSibling;
                                if (nextDl && nextDl.tagName === 'DL') {
                                    parseDl(nextDl, newFolder.id);
                                }
                            } else if (bookmarkLink) {
                                const newBookmark = {
                                    id: uniqueId,
                                    type: 'bookmark',
                                    name: bookmarkLink.textContent.trim(),
                                    url: bookmarkLink.getAttribute('HREF'),
                                    parentId: parentId,
                                    dateAdded: dateAdded
                                };
                                newItems.push(newBookmark);
                            }
                        }
                    };
                    
                    const firstDl = doc.querySelector('DL');
                    if (firstDl) {
                        parseDl(firstDl, null);
                    } else {
                        throw new Error("Formato de arquivo HTML de favoritos inválido.");
                    }

                    const importedData = { items: newItems, sort: 'manual' };

                    if (confirm('Isso substituirá todos os seus favoritos atuais. Deseja continuar?')) {
                        data = importedData;
                        saveData();
                        renderBookmarks();
                        updateActiveSortButton();
                    }
                } catch (error) {
                    console.error("Erro ao importar HTML:", error);
                    alert('Erro ao ler o arquivo de favoritos HTML. Verifique o formato do arquivo.');
                }
            };
            reader.readAsText(file);
        } else {
            alert('Tipo de arquivo não suportado. Por favor, selecione um arquivo .json ou .html.');
        }
    };

    // --- ORDENAÇÃO ---
    const updateActiveSortButton = () => {
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === data.sort);
        });
    };

    // --- EVENT LISTENERS ---
    searchInput.addEventListener('input', (e) => renderBookmarks(e.target.value));
    addCurrentPageBtn.addEventListener('click', addCurrentPage);
    addFolderBtn.addEventListener('click', addFolder);
    
    // Menu de Configurações
    settingsBtn.addEventListener('click', () => {
        settingsMenu.style.display = settingsMenu.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', (e) => {
        if (!settingsBtn.contains(e.target) && !settingsMenu.contains(e.target)) {
            settingsMenu.style.display = 'none';
        }
    });

    exportBtn.addEventListener('click', exportData);
    importBtn.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', importData);
    
    // Modal
    closeBtn.addEventListener('click', closeEditModal);
    saveEditBtn.addEventListener('click', saveEdit);
    window.addEventListener('click', (e) => {
        if (e.target === editModal) closeEditModal();
    });

    // Ordenação
    sortContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('sort-btn')) {
            data.sort = e.target.dataset.sort;
            saveData();
            renderBookmarks(searchInput.value);
            updateActiveSortButton();
        }
    });

    // --- INICIALIZAÇÃO ---
    loadData();
});

