import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { JSX, useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface SupplyChainData {
  id: string;
  name: string;
  orderAmount: string;
  creditScore: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
}

interface CreditAnalysis {
  riskScore: number;
  creditLimit: number;
  repaymentAbility: number;
  transactionHistory: number;
  growthPotential: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [supplyData, setSupplyData] = useState<SupplyChainData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingData, setCreatingData] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newData, setNewData] = useState({ name: "", orderAmount: "", creditScore: "" });
  const [selectedData, setSelectedData] = useState<SupplyChainData | null>(null);
  const [decryptedInfo, setDecryptedInfo] = useState<{ orderAmount: number | null; creditScore: number | null }>({ orderAmount: null, creditScore: null });
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterVerified, setFilterVerified] = useState(false);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting} = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized) return;
      if (fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const dataList: SupplyChainData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          dataList.push({
            id: businessId,
            name: businessData.name,
            orderAmount: businessId,
            creditScore: businessId,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setSupplyData(dataList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createData = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingData(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating encrypted supply chain data..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const orderAmount = parseInt(newData.orderAmount) || 0;
      const businessId = `supply-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, orderAmount);
      
      const tx = await contract.createBusinessData(
        businessId,
        newData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newData.creditScore) || 0,
        0,
        "Supply Chain Finance Data"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Data created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewData({ name: "", orderAmount: "", creditScore: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingData(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted and verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data is already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const analyzeCredit = (data: SupplyChainData, decryptedOrderAmount: number | null, decryptedCreditScore: number | null): CreditAnalysis => {
    const orderAmount = data.isVerified ? (data.decryptedValue || 0) : (decryptedOrderAmount || data.publicValue1 || 5000);
    const creditScore = data.publicValue1 || 5;
    
    const baseRisk = Math.max(10, Math.min(90, 100 - (orderAmount * 0.001 + creditScore * 5)));
    const creditLimit = Math.round(orderAmount * 0.8 + creditScore * 200);
    const repaymentAbility = Math.min(95, Math.round((orderAmount * 0.002 + creditScore * 8) * 10));
    
    const transactionHistory = Math.round(creditScore * 15 + Math.log(orderAmount + 1) * 2);
    const growthPotential = Math.min(95, Math.round((orderAmount * 0.0001 + creditScore * 0.8) * 100));

    return {
      riskScore: baseRisk,
      creditLimit,
      repaymentAbility,
      transactionHistory,
      growthPotential
    };
  };

  const filteredData = supplyData.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = !filterVerified || item.isVerified;
    return matchesSearch && matchesFilter;
  });

  const renderStats = () => {
    const totalRecords = supplyData.length;
    const verifiedRecords = supplyData.filter(m => m.isVerified).length;
    const avgCredit = supplyData.length > 0 
      ? supplyData.reduce((sum, m) => sum + m.publicValue1, 0) / supplyData.length 
      : 0;
    
    const recentRecords = supplyData.filter(m => 
      Date.now()/1000 - m.timestamp < 60 * 60 * 24 * 7
    ).length;

    return (
      <div className="stats-grid">
        <div className="stat-card metal-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3>Total Records</h3>
            <div className="stat-value">{totalRecords}</div>
            <div className="stat-trend">+{recentRecords} this week</div>
          </div>
        </div>
        
        <div className="stat-card metal-card">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <h3>Verified Data</h3>
            <div className="stat-value">{verifiedRecords}/{totalRecords}</div>
            <div className="stat-trend">FHE Verified</div>
          </div>
        </div>
        
        <div className="stat-card metal-card">
          <div className="stat-icon">⭐</div>
          <div className="stat-content">
            <h3>Avg Credit Score</h3>
            <div className="stat-value">{avgCredit.toFixed(1)}/10</div>
            <div className="stat-trend">Protected</div>
          </div>
        </div>
      </div>
    );
  };

  const renderCreditChart = (data: SupplyChainData, decryptedOrderAmount: number | null, decryptedCreditScore: number | null) => {
    const analysis = analyzeCredit(data, decryptedOrderAmount, decryptedCreditScore);
    
    return (
      <div className="credit-chart">
        <div className="chart-row">
          <div className="chart-label">Risk Score</div>
          <div className="chart-bar">
            <div 
              className="bar-fill risk" 
              style={{ width: `${analysis.riskScore}%` }}
            >
              <span className="bar-value">{analysis.riskScore}</span>
            </div>
          </div>
        </div>
        <div className="chart-row">
          <div className="chart-label">Credit Limit</div>
          <div className="chart-bar">
            <div 
              className="bar-fill" 
              style={{ width: `${Math.min(100, analysis.creditLimit/10000)}%` }}
            >
              <span className="bar-value">${analysis.creditLimit}</span>
            </div>
          </div>
        </div>
        <div className="chart-row">
          <div className="chart-label">Repayment Ability</div>
          <div className="chart-bar">
            <div 
              className="bar-fill" 
              style={{ width: `${analysis.repaymentAbility}%` }}
            >
              <span className="bar-value">{analysis.repaymentAbility}%</span>
            </div>
          </div>
        </div>
        <div className="chart-row">
          <div className="chart-label">Transaction History</div>
          <div className="chart-bar">
            <div 
              className="bar-fill" 
              style={{ width: `${analysis.transactionHistory}%` }}
            >
              <span className="bar-value">{analysis.transactionHistory}</span>
            </div>
          </div>
        </div>
        <div className="chart-row">
          <div className="chart-label">Growth Potential</div>
          <div className="chart-bar">
            <div 
              className="bar-fill growth" 
              style={{ width: `${analysis.growthPotential}%` }}
            >
              <span className="bar-value">{analysis.growthPotential}%</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderFHEProcess = () => {
    return (
      <div className="fhe-process">
        <div className="process-step">
          <div className="step-icon">🔒</div>
          <div className="step-content">
            <h4>Order Amount Encryption</h4>
            <p>Supplier encrypts order data with FHE 🔐</p>
          </div>
        </div>
        <div className="process-arrow">→</div>
        <div className="process-step">
          <div className="step-icon">📡</div>
          <div className="step-content">
            <h4>On-chain Storage</h4>
            <p>Encrypted data stored publicly on blockchain</p>
          </div>
        </div>
        <div className="process-arrow">→</div>
        <div className="process-step">
          <div className="step-icon">⚡</div>
          <div className="step-content">
            <h4>Homomorphic Evaluation</h4>
            <p>Lender computes credit limit without decryption</p>
          </div>
        </div>
        <div className="process-arrow">→</div>
        <div className="process-step">
          <div className="step-icon">🔓</div>
          <div className="step-content">
            <h4>Secure Verification</h4>
            <p>Offline decryption with on-chain proof verification</p>
          </div>
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>SupplyFi FHE 🔐</h1>
            <p>Confidential Supply Chain Finance</p>
          </div>
          <div className="header-actions">
            <div className="wallet-connect-wrapper">
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
            </div>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🏭</div>
            <h2>Connect Your Wallet to Access SupplyFi</h2>
            <p>Secure, privacy-preserving supply chain finance platform powered by FHE technology</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect your wallet to initialize FHE system</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>Upload encrypted accounts receivable data</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Get homomorphic credit evaluation</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
        <p className="loading-note">Secure supply chain finance platform loading</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted supply chain data...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>SupplyFi FHE 🔐</h1>
          <p>Confidential Supply Chain Finance</p>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn metal-btn"
          >
            + New Invoice
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content">
        <div className="dashboard-section">
          <h2>Supply Chain Finance Dashboard</h2>
          {renderStats()}
          
          <div className="fhe-explainer metal-card">
            <h3>FHE 🔐 Privacy-Preserving Finance</h3>
            {renderFHEProcess()}
          </div>
        </div>
        
        <div className="data-section">
          <div className="section-header">
            <h2>Accounts Receivable Records</h2>
            <div className="header-controls">
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search records..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <label className="filter-toggle">
                <input 
                  type="checkbox" 
                  checked={filterVerified}
                  onChange={(e) => setFilterVerified(e.target.checked)}
                />
                Verified Only
              </label>
              <button 
                onClick={loadData} 
                className="refresh-btn metal-btn" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "🔄" : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="data-list">
            {filteredData.length === 0 ? (
              <div className="no-data">
                <p>No supply chain records found</p>
                <button 
                  className="create-btn metal-btn" 
                  onClick={() => setShowCreateModal(true)}
                >
                  Upload First Invoice
                </button>
              </div>
            ) : filteredData.map((data, index) => (
              <div 
                className={`data-item ${selectedData?.id === data.id ? "selected" : ""} ${data.isVerified ? "verified" : ""}`} 
                key={index}
                onClick={() => setSelectedData(data)}
              >
                <div className="data-title">{data.name}</div>
                <div className="data-meta">
                  <span>Credit Score: {data.publicValue1}/10</span>
                  <span>Date: {new Date(data.timestamp * 1000).toLocaleDateString()}</span>
                </div>
                <div className="data-status">
                  Status: {data.isVerified ? "✅ Verified" : "🔓 Pending Verification"}
                  {data.isVerified && data.decryptedValue && (
                    <span className="verified-amount">Amount: ${data.decryptedValue}</span>
                  )}
                </div>
                <div className="data-creator">Supplier: {data.creator.substring(0, 6)}...{data.creator.substring(38)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateData 
          onSubmit={createData} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingData} 
          formData={newData} 
          setFormData={setNewData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedData && (
        <DataDetailModal 
          data={selectedData} 
          onClose={() => { 
            setSelectedData(null); 
            setDecryptedInfo({ orderAmount: null, creditScore: null }); 
          }} 
          decryptedInfo={decryptedInfo} 
          setDecryptedInfo={setDecryptedInfo} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptData(selectedData.id)}
          renderCreditChart={renderCreditChart}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalCreateData: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  formData: any;
  setFormData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, formData, setFormData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'orderAmount') {
      const intValue = value.replace(/[^\d]/g, '');
      setFormData({ ...formData, [name]: intValue });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-data-modal metal-card">
        <div className="modal-header">
          <h2>Upload Encrypted Invoice</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Confidential Finance</strong>
            <p>Order amount encrypted with homomorphic encryption 🔐</p>
          </div>
          
          <div className="form-group">
            <label>Supplier Name *</label>
            <input 
              type="text" 
              name="name" 
              value={formData.name} 
              onChange={handleChange} 
              placeholder="Enter supplier name..." 
            />
          </div>
          
          <div className="form-group">
            <label>Order Amount (Integer only) *</label>
            <input 
              type="number" 
              name="orderAmount" 
              value={formData.orderAmount} 
              onChange={handleChange} 
              placeholder="Enter order amount..." 
              step="1"
              min="0"
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
          
          <div className="form-group">
            <label>Credit Score (1-10) *</label>
            <input 
              type="number" 
              min="1" 
              max="10" 
              name="creditScore" 
              value={formData.creditScore} 
              onChange={handleChange} 
              placeholder="Enter credit score..." 
            />
            <div className="data-type-label">Public Data</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn metal-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !formData.name || !formData.orderAmount || !formData.creditScore} 
            className="submit-btn metal-btn"
          >
            {creating || isEncrypting ? "Encrypting..." : "Upload Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
};

const DataDetailModal: React.FC<{
  data: SupplyChainData;
  onClose: () => void;
  decryptedInfo: { orderAmount: number | null; creditScore: number | null };
  setDecryptedInfo: (value: { orderAmount: number | null; creditScore: number | null }) => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
  renderCreditChart: (data: SupplyChainData, decryptedOrderAmount: number | null, decryptedCreditScore: number | null) => JSX.Element;
}> = ({ data, onClose, decryptedInfo, setDecryptedInfo, isDecrypting, decryptData, renderCreditChart }) => {
  const handleDecrypt = async () => {
    if (decryptedInfo.orderAmount !== null) { 
      setDecryptedInfo({ orderAmount: null, creditScore: null }); 
      return; 
    }
    
    const decrypted = await decryptData();
    if (decrypted !== null) {
      setDecryptedInfo({ orderAmount: decrypted, creditScore: decrypted });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="data-detail-modal metal-card">
        <div className="modal-header">
          <h2>Invoice Details & Credit Analysis</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="data-info">
            <div className="info-item">
              <span>Supplier:</span>
              <strong>{data.name}</strong>
            </div>
            <div className="info-item">
              <span>Creator:</span>
              <strong>{data.creator.substring(0, 6)}...{data.creator.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Upload Date:</span>
              <strong>{new Date(data.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span>Credit Score:</span>
              <strong>{data.publicValue1}/10</strong>
            </div>
          </div>
          
          <div className="data-section">
            <h3>Encrypted Order Amount</h3>
            
            <div className="data-row">
              <div className="data-label">Order Amount:</div>
              <div className="data-value">
                {data.isVerified && data.decryptedValue ? 
                  `$${data.decryptedValue} (Verified)` : 
                  decryptedInfo.orderAmount !== null ? 
                  `$${decryptedInfo.orderAmount} (Decrypted)` : 
                  "🔒 FHE Encrypted"
                }
              </div>
              <button 
                className={`decrypt-btn metal-btn ${(data.isVerified || decryptedInfo.orderAmount !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  "🔓 Verifying..."
                ) : data.isVerified ? (
                  "✅ Verified"
                ) : decryptedInfo.orderAmount !== null ? (
                  "🔄 Re-verify"
                ) : (
                  "🔓 Verify Amount"
                )}
              </button>
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE 🔐 Confidential Finance</strong>
                <p>Order amount encrypted on-chain. Verify to perform homomorphic credit evaluation.</p>
              </div>
            </div>
          </div>
          
          {(data.isVerified || decryptedInfo.orderAmount !== null) && (
            <div className="analysis-section">
              <h3>Credit Risk Analysis</h3>
              {renderCreditChart(
                data, 
                data.isVerified ? data.decryptedValue || null : decryptedInfo.orderAmount, 
                null
              )}
              
              <div className="decrypted-values">
                <div className="value-item">
                  <span>Order Amount:</span>
                  <strong>
                    {data.isVerified ? 
                      `$${data.decryptedValue} (Verified)` : 
                      `$${decryptedInfo.orderAmount} (Decrypted)`
                    }
                  </strong>
                  <span className={`data-badge ${data.isVerified ? 'verified' : 'local'}`}>
                    {data.isVerified ? 'On-chain Verified' : 'Local Decryption'}
                  </span>
                </div>
                <div className="value-item">
                  <span>Credit Score:</span>
                  <strong>{data.publicValue1}/10</strong>
                  <span className="data-badge public">Public Data</span>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn metal-btn">Close</button>
          {!data.isVerified && (
            <button 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
              className="verify-btn metal-btn"
            >
              {isDecrypting ? "Verifying..." : "Verify on-chain"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;

