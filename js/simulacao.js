/* ==========================================================
   SOU + BLU – Simulador de Troco [OTIMIZADO]
   ========================================================== */

window.SimulacaoTroco = {
  PARCELAS: 22,

  // Tabelas de Fatores (mantidas para referência do negócio)
  TABELAS: [
    { grupo: 'NEO', id: 'NEO',     label: 'NEO',     code: 'TB 4,19',  fator: 0.04199 },
    { grupo: 'NEO', id: 'NEO_1',   label: 'NEO 1',   code: 'TB 3,99',  fator: 0.0409485 },
    { grupo: 'NEO', id: 'NEO_2',   label: 'NEO 2',   code: 'TB 3,79',  fator: 0.039089208 },
    { grupo: 'NEO', id: 'NEO_3',   label: 'NEO 3',   code: 'TB 3,59',  fator: 0.037249047 },
    { grupo: 'AKI', id: 'AKI',     label: 'AKI',     code: 'TBM 4,49', fator: 0.04499 },
    { grupo: 'AKI', id: 'AKI_1',   label: 'AKI 1',   code: 'TBM 4,19', fator: 0.04199 },
    { grupo: 'AKI', id: 'AKI_2',   label: 'AKI 2',   code: 'TBM 3,99', fator: 0.0399 },
    { grupo: 'AKI', id: 'AKI_3',   label: 'AKI 3',   code: 'TBM 3,79', fator: 0.0379 },
  ],

  // Formatação robusta de moeda
  fmt: (v) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),

  getTabela: (id) => window.SimulacaoTroco.TABELAS.find(t => t.id === id) || null,

  // Cálculo preciso (utilizando arredondamento matemático padrão)
  calcular(parcela, tabelaId, margemAdicional) {
    const p = parseFloat(parcela) || 0;
    const margem = parseFloat(margemAdicional) || 0;
    const tab = this.getTabela(tabelaId);
    
    if (!p || !tab?.fator) {
      return { saldoDevedor: 0, saldoLiberado: 0, margemLiberada: 0, troco: 0, tabela: tab };
    }

    const saldoDevedor = p * this.PARCELAS;
    const saldoLiberado = p / tab.fator;
    const margemLiberada = margem > 0 ? (margem / tab.fator) : 0;
    const troco = saldoLiberado - saldoDevedor + margemLiberada;

    return { 
      saldoDevedor: saldoDevedor.toFixed(2), 
      saldoLiberado: saldoLiberado.toFixed(2), 
      margemLiberada: margemLiberada.toFixed(2), 
      troco: troco.toFixed(2), 
      tabela: tab 
    };
  },

  fillSelect(selectEl, defaultId) {
    if (!selectEl) return;
    const grupos = [...new Set(this.TABELAS.map(t => t.grupo))];
    
    selectEl.innerHTML = '<option value="">Selecione a tabela</option>' + 
      grupos.map(gk => `
        <optgroup label="${gk}">
          ${this.TABELAS.filter(t => t.grupo === gk).map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
        </optgroup>
      `).join('');
    
    if (defaultId) selectEl.value = defaultId;
  },

  render() {
    const inputs = {
      parcela: document.getElementById('simParcela'),
      tabela: document.getElementById('simTabela'),
      margem: document.getElementById('simMargemAdicional')
    };
    const outputs = {
      devedor: document.getElementById('simSaldoDevedor'),
      liberado: document.getElementById('simSaldoLiberado'),
      margemLib: document.getElementById('simMargemLiberada'),
      troco: document.getElementById('simTrocoValor'),
      hint: document.getElementById('simTabelaHint')
    };

    if (!inputs.parcela || !inputs.tabela) return;

    const r = this.calcular(inputs.parcela.value, inputs.tabela.value, inputs.margem?.value);

    if (outputs.devedor) outputs.devedor.textContent = r.saldoDevedor > 0 ? this.fmt(r.saldoDevedor) : '—';
    if (outputs.liberado) outputs.liberado.textContent = r.saldoLiberado > 0 ? this.fmt(r.saldoLiberado) : '—';
    if (outputs.margemLib) outputs.margemLib.textContent = r.margemLiberada > 0 ? this.fmt(r.margemLiberada) : '—';
    if (outputs.troco) outputs.troco.textContent = this.fmt(r.troco);

    if (outputs.hint) {
      outputs.hint.textContent = r.tabela ? `${r.tabela.label} · Fator: ${r.tabela.fator} · ${r.tabela.code}` : 'Selecione parcela e tabela.';
    }
  },

  init() {
    const tabelaEl = document.getElementById('simTabela');
    const parcelaEl = document.getElementById('simParcela');
    const margemEl = document.getElementById('simMargemAdicional');

    if (!tabelaEl || tabelaEl.dataset.simInit) return;
    tabelaEl.dataset.simInit = '1';

    this.fillSelect(tabelaEl, 'NEO_3');

    // Listener unificado
    [tabelaEl, parcelaEl, margemEl].forEach(el => {
      el?.addEventListener('input', () => this.render());
      el?.addEventListener('change', () => this.render());
    });

    this.render();
  }
};