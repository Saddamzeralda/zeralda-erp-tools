/**
 * AI File Upload & Processing Widget
 * تحميل الملفات والصور للمعالجة بواسطة AI مع OCR متقدم
 */

(function() {
  'use strict';

  window.AIFileProcessor = {
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // File Analysis Functions
    // ═══════════════════════════════════════════════════════════════════════════════
    
    analyzeFile: function(file, analysisType, onProgress, onComplete) {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const fileBase64 = e.target.result.split(',')[1];
        const mimeType = file.type;
        const fileName = file.name;
        
        if (onProgress) onProgress('Sending file to AI for analysis...');
        
        fetch('/api/ai/analyze-file', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (localStorage.getItem('zeralda-session-token') || ''),
          },
          body: JSON.stringify({
            fileBase64,
            mimeType,
            fileName,
            analysisType: analysisType || 'general',
            language: 'ara+eng'
          })
        })
        .then(r => r.json())
        .then(result => {
          if (result.ok) {
            if (onProgress) onProgress('Analysis complete');
            if (onComplete) onComplete(null, result);
          } else {
            if (onComplete) onComplete(result.error, null);
          }
        })
        .catch(err => {
          if (onComplete) onComplete(err.message, null);
        });
      };
      
      reader.readAsDataURL(file);
    },

    /**
     * Extract invoice data using OCR + AI
     */
    extractInvoice: function(file, onProgress, onComplete) {
      this.analyzeFile(file, 'invoice', onProgress, onComplete);
    },

    /**
     * Extract table data from image
     */
    extractTable: function(file, onProgress, onComplete) {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const fileBase64 = e.target.result.split(',')[1];
        
        if (onProgress) onProgress('Extracting table data...');
        
        fetch('/api/ai/extract-table', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (localStorage.getItem('zeralda-session-token') || ''),
          },
          body: JSON.stringify({
            fileBase64,
            mimeType: file.type,
            fileName: file.name
          })
        })
        .then(r => r.json())
        .then(result => {
          if (result.ok) {
            if (onProgress) onProgress('Table extracted');
            if (onComplete) onComplete(null, result);
          } else {
            if (onComplete) onComplete(result.error, null);
          }
        })
        .catch(err => {
          if (onComplete) onComplete(err.message, null);
        });
      };
      
      reader.readAsDataURL(file);
    },

    /**
     * Classify document type
     */
    classifyDocument: function(file, customCategories, onProgress, onComplete) {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const fileBase64 = e.target.result.split(',')[1];
        
        if (onProgress) onProgress('Classifying document...');
        
        fetch('/api/ai/classify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (localStorage.getItem('zeralda-session-token') || ''),
          },
          body: JSON.stringify({
            fileBase64,
            mimeType: file.type,
            fileName: file.name,
            categories: customCategories
          })
        })
        .then(r => r.json())
        .then(result => {
          if (result.ok) {
            if (onProgress) onProgress('Classification complete');
            if (onComplete) onComplete(null, result);
          } else {
            if (onComplete) onComplete(result.error, null);
          }
        })
        .catch(err => {
          if (onComplete) onComplete(err.message, null);
        });
      };
      
      reader.readAsDataURL(file);
    },

    /**
     * Compare multiple documents
     */
    compareDocuments: function(files, comparisonType, onProgress, onComplete) {
      let processed = 0;
      const filesData = [];
      
      files.forEach((file, idx) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
          filesData[idx] = {
            base64: e.target.result.split(',')[1],
            mime_type: file.type,
            file_name: file.name
          };
          
          processed++;
          if (onProgress) onProgress(`Processing files: ${processed}/${files.length}...`);
          
          if (processed === files.length) {
            this._sendComparisonRequest(filesData, comparisonType, onProgress, onComplete);
          }
        };
        
        reader.readAsDataURL(file);
      });
    },

    _sendComparisonRequest: function(filesData, comparisonType, onProgress, onComplete) {
      if (onProgress) onProgress('Comparing documents with AI...');
      
      fetch('/api/ai/compare-files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (localStorage.getItem('zeralda-session-token') || ''),
        },
        body: JSON.stringify({
          files: filesData,
          type: comparisonType || 'differences'
        })
      })
      .then(r => r.json())
      .then(result => {
        if (result.ok) {
          if (onProgress) onProgress('Comparison complete');
          if (onComplete) onComplete(null, result);
        } else {
          if (onComplete) onComplete(result.error, null);
        }
      })
      .catch(err => {
        if (onComplete) onComplete(err.message, null);
      });
    },

    /**
     * Create HTML UI for file upload
     */
    createUploadUI: function(container, options) {
      options = options || {};
      const multiple = options.multiple !== false;
      const types = options.types || ['image/*', 'application/pdf', '.xlsx', '.xls', '.docx', '.doc'];
      const analysisTypes = options.analysisTypes || [
        { id: 'general', label: 'General Analysis' },
        { id: 'invoice', label: 'Invoice' },
        { id: 'receipt', label: 'Receipt' },
        { id: 'contract', label: 'Contract' },
        { id: 'table', label: 'Extract Table' },
        { id: 'form', label: 'Form' }
      ];
      
      const html = `
        <div class="ai-file-processor" style="padding: 15px; border: 1px solid #ddd; border-radius: 8px; background: #f9f9f9;">
          <h3 style="margin-top: 0; margin-bottom: 10px;">📄 AI File Processor</h3>
          
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Analysis Type:</label>
            <select id="aiAnalysisType" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
              ${analysisTypes.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
            </select>
          </div>
          
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">Upload Files:</label>
            <input type="file" id="aiFileInput" ${multiple ? 'multiple' : ''} 
                   accept="${types.join(',')}"
                   style="display: block; width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">
          </div>
          
          <div style="display: flex; gap: 8px;">
            <button id="aiAnalyzeBtn" style="flex: 1; padding: 8px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">
              🔍 Analyze
            </button>
            <button id="aiCompareBtn" style="flex: 1; padding: 8px; background: #7c3aed; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">
              ⚖️ Compare
            </button>
          </div>
          
          <div id="aiProcessingStatus" style="margin-top: 10px; padding: 8px; background: white; border-radius: 4px; display: none; font-size: 13px; color: #666;">
            <span id="aiStatusText"></span>
            <div id="aiProgressBar" style="margin-top: 6px; height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden; display: none;">
              <div id="aiProgressFill" style="height: 100%; width: 0%; background: #2563eb; transition: width 0.3s;"></div>
            </div>
          </div>
          
          <div id="aiResultsContainer" style="margin-top: 12px; max-height: 400px; overflow-y: auto;"></div>
        </div>
      `;
      
      container.innerHTML = html;
      
      // Bind events
      const analyzeBtn = container.querySelector('#aiAnalyzeBtn');
      const compareBtn = container.querySelector('#aiCompareBtn');
      const fileInput = container.querySelector('#aiFileInput');
      const typeSelect = container.querySelector('#aiAnalysisType');
      const statusDiv = container.querySelector('#aiProcessingStatus');
      const statusText = container.querySelector('#aiStatusText');
      const resultsDiv = container.querySelector('#aiResultsContainer');
      
      analyzeBtn.addEventListener('click', () => {
        const files = fileInput.files;
        if (!files.length) {
          alert('Please select a file first');
          return;
        }
        
        const analysisType = typeSelect.value;
        statusDiv.style.display = 'block';
        resultsDiv.innerHTML = '';
        
        Array.from(files).forEach(file => {
          window.AIFileProcessor.analyzeFile(
            file,
            analysisType,
            (msg) => {
              statusText.textContent = msg;
            },
            (err, result) => {
              if (err) {
                statusText.textContent = '❌ Error: ' + err;
              } else {
                this._displayResults(resultsDiv, result);
              }
            }
          );
        });
      });
      
      compareBtn.addEventListener('click', () => {
        const files = fileInput.files;
        if (files.length < 2) {
          alert('Please select at least 2 files to compare');
          return;
        }
        
        statusDiv.style.display = 'block';
        resultsDiv.innerHTML = '';
        
        window.AIFileProcessor.compareDocuments(
          Array.from(files),
          'differences',
          (msg) => {
            statusText.textContent = msg;
          },
          (err, result) => {
            if (err) {
              statusText.textContent = '❌ Error: ' + err;
            } else {
              this._displayResults(resultsDiv, result);
            }
          }
        );
      });
    },

    _displayResults: function(container, result) {
      let html = `<div style="background: white; padding: 10px; border-radius: 4px; margin-bottom: 8px;">`;
      
      if (result.classification) {
        html += `<p><strong>Classification:</strong> ${result.classification.category} (${(result.classification.confidence * 100).toFixed(0)}%)</p>`;
      }
      
      if (result.text) {
        html += `<p><strong>Extracted Text:</strong></p><pre style="background: #f5f5f5; padding: 8px; overflow-x: auto; font-size: 12px; max-height: 200px;">${result.text.substring(0, 500)}...</pre>`;
      }
      
      if (result.analysis) {
        html += `<p><strong>Analysis:</strong></p><pre style="background: #f5f5f5; padding: 8px; overflow-x: auto; font-size: 12px; max-height: 200px;">${JSON.stringify(result.analysis, null, 2).substring(0, 500)}...</pre>`;
      }
      
      if (result.tables && result.tables.length) {
        html += `<p><strong>Tables Found:</strong> ${result.tables.length}</p>`;
      }
      
      html += `</div>`;
      
      container.innerHTML += html;
    }
  };
  
  // Auto-initialize if element exists
  window.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('aiFileProcessorWidget');
    if (el) {
      window.AIFileProcessor.createUploadUI(el);
    }
  });

})();
