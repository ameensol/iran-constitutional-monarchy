// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Constitution
/// @notice Central registry of constitutional parameters, roles, and contract addresses.
///         All governance contracts reference this registry for authorization, role lookup,
///         and configurable parameters (term lengths, quorums, deadlines, thresholds).
/// @dev This is the "hub" of the governance system. It is deployed first, then all other
///      contracts register themselves here. Role changes are made by the contracts that
///      manage those roles (e.g., Executive.sol sets the PM role after a confidence vote).
contract Constitution {
    // ─── Errors ──────────────────────────────────────────────────────────

    error NotAuthorized();
    error NotDeployer();
    error AlreadyInitialized();
    error ZeroAddress();
    error InvalidParameter();
    error InvalidAddress();
    error AlreadyFinalized();

    // ─── Events ──────────────────────────────────────────────────────────

    event RoleChanged(bytes32 indexed role, address indexed oldHolder, address indexed newHolder);
    event ParameterAmended(bytes32 indexed key, uint256 oldValue, uint256 newValue);
    event ContractAmended(bytes32 indexed name, address indexed oldAddr, address indexed newAddr);
    event ContractRegistered(bytes32 indexed name, address indexed addr);
    event Initialized();
    event SetupFinalized();

    // ─── Well-known Role Keys ────────────────────────────────────────────

    bytes32 public constant ROLE_MONARCH = keccak256("MONARCH");
    bytes32 public constant ROLE_REGENT = keccak256("REGENT");
    bytes32 public constant ROLE_PRIME_MINISTER = keccak256("PRIME_MINISTER");
    bytes32 public constant ROLE_AUDIT_HEAD = keccak256("AUDIT_HEAD");

    // ─── Well-known Parameter Keys ───────────────────────────────────────

    bytes32 public constant PARAM_MAJLIS_TERM = keccak256("MAJLIS_TERM");
    bytes32 public constant PARAM_SENATE_TERM = keccak256("SENATE_TERM");
    bytes32 public constant PARAM_JUSTICE_TERM = keccak256("JUSTICE_TERM");
    bytes32 public constant PARAM_JUSTICE_COUNT = keccak256("JUSTICE_COUNT");
    bytes32 public constant PARAM_COURT_QUORUM = keccak256("COURT_QUORUM");
    bytes32 public constant PARAM_SENATE_CROWN_PCT = keccak256("SENATE_CROWN_PCT");
    bytes32 public constant PARAM_CROWN_LAW_DEADLINE = keccak256("CROWN_LAW_DEADLINE");
    bytes32 public constant PARAM_SENATE_REVIEW_PERIOD = keccak256("SENATE_REVIEW_PERIOD");
    bytes32 public constant PARAM_CONFIDENCE_HONEYMOON = keccak256("CONFIDENCE_HONEYMOON");
    bytes32 public constant PARAM_NOMINATION_DEADLINE = keccak256("NOMINATION_DEADLINE");
    bytes32 public constant PARAM_MAJLIS_LIST_DEADLINE = keccak256("MAJLIS_LIST_DEADLINE");
    bytes32 public constant PARAM_ELECTION_REG_PERIOD = keccak256("ELECTION_REG_PERIOD");
    bytes32 public constant PARAM_ELECTION_VOTE_PERIOD = keccak256("ELECTION_VOTE_PERIOD");
    bytes32 public constant PARAM_DISSOLUTION_ELECTION_DEADLINE = keccak256("DISSOLUTION_ELECTION_DEADLINE");
    bytes32 public constant PARAM_AMENDMENT_THRESHOLD = keccak256("AMENDMENT_THRESHOLD");
    bytes32 public constant PARAM_EMERGENCY_AMEND_THRESHOLD = keccak256("EMERGENCY_AMEND_THRESHOLD");
    bytes32 public constant PARAM_EMERGENCY_AMEND_DURATION = keccak256("EMERGENCY_AMEND_DURATION");
    bytes32 public constant PARAM_CROWN_APPOINT_DEADLINE = keccak256("CROWN_APPOINT_DEADLINE");
    bytes32 public constant PARAM_CROWN_JUSTICE_APPOINT_DEADLINE = keccak256("CROWN_JUSTICE_APPOINT_DEADLINE");
    bytes32 public constant PARAM_CONFIDENCE_VOTE_PERIOD = keccak256("CONFIDENCE_VOTE_PERIOD");
    bytes32 public constant PARAM_MAJLIS_QUORUM = keccak256("MAJLIS_QUORUM");
    bytes32 public constant PARAM_SENATE_QUORUM = keccak256("SENATE_QUORUM");
    bytes32 public constant PARAM_MIN_VOTING_PERIOD = keccak256("MIN_VOTING_PERIOD");
    bytes32 public constant PARAM_PETITION_TIMEOUT = keccak256("PETITION_TIMEOUT");
    bytes32 public constant PARAM_FACT_CERT_PERIOD = keccak256("FACT_CERT_PERIOD");
    bytes32 public constant PARAM_BY_ELECTION_DEADLINE = keccak256("BY_ELECTION_DEADLINE");
    bytes32 public constant PARAM_VACANCY_VOTE_PERIOD = keccak256("VACANCY_VOTE_PERIOD");
    bytes32 public constant PARAM_COURT_LIVENESS_PERIOD = keccak256("COURT_LIVENESS_PERIOD");
    bytes32 public constant PARAM_COURT_INACTIVITY_PERIOD = keccak256("COURT_INACTIVITY_PERIOD");
    bytes32 public constant PARAM_COUNCIL_TERM = keccak256("COUNCIL_TERM");
    bytes32 public constant PARAM_SENATE_SELECTION_REG_PERIOD = keccak256("SENATE_SELECTION_REG_PERIOD");
    bytes32 public constant PARAM_SENATE_SELECTION_VOTE_PERIOD = keccak256("SENATE_SELECTION_VOTE_PERIOD");
    bytes32 public constant PARAM_SUCCESSION_REFERENDUM_DEADLINE = keccak256("SUCCESSION_REFERENDUM_DEADLINE");
    bytes32 public constant PARAM_DEPUTY_DESIGNATION_DEADLINE = keccak256("DEPUTY_DESIGNATION_DEADLINE");
    bytes32 public constant PARAM_TOTAL_MAJLIS_SEATS = keccak256("TOTAL_MAJLIS_SEATS");
    bytes32 public constant PARAM_CROWN_SEAT_DEADLINE = keccak256("CROWN_SEAT_DEADLINE");

    // ─── Well-known Contract Keys ────────────────────────────────────────

    bytes32 public constant CONTRACT_CITIZEN_REGISTRY = keccak256("CITIZEN_REGISTRY");
    bytes32 public constant CONTRACT_CROWN = keccak256("CROWN");
    bytes32 public constant CONTRACT_PARLIAMENT = keccak256("PARLIAMENT");
    bytes32 public constant CONTRACT_EXECUTIVE = keccak256("EXECUTIVE");
    bytes32 public constant CONTRACT_SUPREME_COURT = keccak256("SUPREME_COURT");
    bytes32 public constant CONTRACT_ELECTION = keccak256("ELECTION");
    bytes32 public constant CONTRACT_REFERENDUM = keccak256("REFERENDUM");
    bytes32 public constant CONTRACT_BUDGET = keccak256("BUDGET");
    bytes32 public constant CONTRACT_PROVINCIAL_COUNCIL = keccak256("PROVINCIAL_COUNCIL");
    bytes32 public constant CONTRACT_BALLOT_VERIFIER = keccak256("BALLOT_VERIFIER");

    // ─── State ───────────────────────────────────────────────────────────

    /// @notice The deployer who performs initial setup.
    address public deployer;

    /// @notice Whether the system has been initialized (all contracts wired).
    bool public initialized;

    /// @notice Role holders: role key => address.
    mapping(bytes32 => address) private _roles;

    /// @notice Constitutional parameters: key => value.
    mapping(bytes32 => uint256) private _parameters;

    /// @notice Registered governance contracts: name => address.
    mapping(bytes32 => address) private _contracts;

    /// @notice Parameters that cannot be changed by emergency amendment.
    mapping(bytes32 => bool) private _protectedParameters;

    // ─── Constructor ─────────────────────────────────────────────────────

    constructor() {
        deployer = msg.sender;

        // Set default constitutional parameters
        _parameters[PARAM_MAJLIS_TERM] = 4 * 365 days;              // 4 years
        _parameters[PARAM_SENATE_TERM] = 6 * 365 days;              // 6 years
        _parameters[PARAM_JUSTICE_TERM] = 9 * 365 days;             // 9 years
        _parameters[PARAM_JUSTICE_COUNT] = 12;                       // 12 justices
        _parameters[PARAM_COURT_QUORUM] = 7;                        // 7 justices for quorum
        _parameters[PARAM_SENATE_CROWN_PCT] = 10;                   // 10% max Crown senators
        _parameters[PARAM_CROWN_LAW_DEADLINE] = 14 days;            // 14 days for Crown to act on law
        _parameters[PARAM_SENATE_REVIEW_PERIOD] = 30 days;          // 30 days for Senate review
        _parameters[PARAM_CONFIDENCE_HONEYMOON] = 90 days;          // 90-day honeymoon period
        _parameters[PARAM_NOMINATION_DEADLINE] = 14 days;           // 14 days for nomination
        _parameters[PARAM_MAJLIS_LIST_DEADLINE] = 14 days;          // 14 days for Majlis list
        _parameters[PARAM_ELECTION_REG_PERIOD] = 14 days;           // 14 days for registration
        _parameters[PARAM_ELECTION_VOTE_PERIOD] = 7 days;           // 7 days for voting
        _parameters[PARAM_DISSOLUTION_ELECTION_DEADLINE] = 60 days; // 60 days for new election
        _parameters[PARAM_AMENDMENT_THRESHOLD] = 67;                // 2/3 = 67%
        _parameters[PARAM_EMERGENCY_AMEND_THRESHOLD] = 75;          // 3/4 = 75%
        _parameters[PARAM_EMERGENCY_AMEND_DURATION] = 365 days;     // 1 year
        _parameters[PARAM_CROWN_APPOINT_DEADLINE] = 7 days;             // 7 days for Crown to pick PM from list
        _parameters[PARAM_CROWN_JUSTICE_APPOINT_DEADLINE] = 14 days;   // 14 days for Crown to pick justice from list (Art. V.3.5)
        _parameters[PARAM_CONFIDENCE_VOTE_PERIOD] = 14 days;            // 14 days for confidence/no-confidence votes
        _parameters[PARAM_MAJLIS_QUORUM] = 50;                        // 50% quorum
        _parameters[PARAM_SENATE_QUORUM] = 50;                        // 50% quorum
        _parameters[PARAM_MIN_VOTING_PERIOD] = 3 days;                // 3-day minimum voting period
        _parameters[PARAM_PETITION_TIMEOUT] = 30 days;                 // 30 days to collect signatures
        _parameters[PARAM_FACT_CERT_PERIOD] = 14 days;                 // 14 days for fact certification voting
        _parameters[PARAM_BY_ELECTION_DEADLINE] = 90 days;               // 90 days for by-election after mid-term vacancy
        _parameters[PARAM_VACANCY_VOTE_PERIOD] = 14 days;                // 14 days for vacancy declaration vote
        _parameters[PARAM_COURT_LIVENESS_PERIOD] = 7 days;                  // 7 days for court liveness challenge
        _parameters[PARAM_COURT_INACTIVITY_PERIOD] = 14 days;               // 14 days for permissionless court inactivity fallback
        _parameters[PARAM_COUNCIL_TERM] = 4 * 365 days;                       // 4-year provincial council terms
        _parameters[PARAM_SENATE_SELECTION_REG_PERIOD] = 14 days;             // 14 days for senate candidate registration
        _parameters[PARAM_SENATE_SELECTION_VOTE_PERIOD] = 7 days;             // 7 days for council senate vote
        _parameters[PARAM_SUCCESSION_REFERENDUM_DEADLINE] = 365 days;           // 1 year for succession referendum (Art. VI.6.1)
        _parameters[PARAM_DEPUTY_DESIGNATION_DEADLINE] = 14 days;               // 14 days for PM to designate Deputy PM (Art. IV.9.1)
        _parameters[PARAM_TOTAL_MAJLIS_SEATS] = 290;                             // Iran's current Majlis size
        _parameters[PARAM_CROWN_SEAT_DEADLINE] = 14 days;                          // 14 days for Crown to seat election winners

        // Protected parameters: cannot be changed by emergency amendment
        _protectedParameters[PARAM_JUSTICE_TERM] = true;
        _protectedParameters[PARAM_COURT_QUORUM] = true;
        _protectedParameters[PARAM_JUSTICE_COUNT] = true;
        _protectedParameters[PARAM_AMENDMENT_THRESHOLD] = true;
        _protectedParameters[PARAM_EMERGENCY_AMEND_THRESHOLD] = true;
        // Election parameters protected per Art. VII.5.3
        _protectedParameters[PARAM_ELECTION_REG_PERIOD] = true;
        _protectedParameters[PARAM_ELECTION_VOTE_PERIOD] = true;
        _protectedParameters[PARAM_DISSOLUTION_ELECTION_DEADLINE] = true;
        _protectedParameters[PARAM_MAJLIS_TERM] = true;
        _protectedParameters[PARAM_SENATE_TERM] = true;
        // Confidence/emergency parameters protected per Art. VII.5.4
        _protectedParameters[PARAM_CONFIDENCE_VOTE_PERIOD] = true;
        _protectedParameters[PARAM_EMERGENCY_AMEND_DURATION] = true;
        // Provincial council term protected per Art. VII.5.4
        _protectedParameters[PARAM_COUNCIL_TERM] = true;
        // Total Majlis seats requires referendum to change
        _protectedParameters[PARAM_TOTAL_MAJLIS_SEATS] = true;
    }

    // ─── Initialization ──────────────────────────────────────────────────

    /// @notice Register all governance contracts. Can only be called once by the deployer.
    /// @param names Array of contract name keys.
    /// @param addrs Array of contract addresses (must match names by index).
    function initialize(bytes32[] calldata names, address[] calldata addrs) external {
        if (initialized) revert AlreadyInitialized();
        if (msg.sender != deployer) revert NotDeployer();
        if (names.length != addrs.length) revert InvalidParameter();

        for (uint256 i = 0; i < names.length; i++) {
            if (addrs[i] == address(0)) revert ZeroAddress();
            if (addrs[i].code.length == 0) revert InvalidAddress();
            _contracts[names[i]] = addrs[i];
            emit ContractRegistered(names[i], addrs[i]);
        }

        initialized = true;
        // deployer kept alive until finalizeSetup() — needed for coronation bootstrap
        emit Initialized();
    }

    // ─── Role Management ─────────────────────────────────────────────────

    /// @notice Set a role holder. Called by authorized governance contracts.
    ///         Art. IX.4: ROLE_AUDIT_HEAD can only be set by Budget or Referendum.
    ///         All other roles: Crown, Executive, or Referendum.
    /// @param role The role key.
    /// @param holder The new role holder (address(0) to vacate).
    function setRole(bytes32 role, address holder) external {
        address s = msg.sender;
        if (role == ROLE_AUDIT_HEAD) {
            // Art. IX.4: Only Budget contract manages the Audit Head role.
            // Referendum retains override power (amendments can change anything).
            if (s != _contracts[CONTRACT_BUDGET] &&
                s != _contracts[CONTRACT_REFERENDUM]) revert NotAuthorized();
        } else {
            if (s != _contracts[CONTRACT_CROWN] &&
                s != _contracts[CONTRACT_EXECUTIVE] &&
                s != _contracts[CONTRACT_REFERENDUM]) revert NotAuthorized();
        }

        address old = _roles[role];
        _roles[role] = holder;

        emit RoleChanged(role, old, holder);
    }

    /// @notice Get the current holder of a role.
    /// @param role The role key.
    /// @return The address holding the role (address(0) if vacant).
    function getRole(bytes32 role) external view returns (address) {
        return _roles[role];
    }

    /// @notice Check if an address holds a specific role.
    /// @param role The role key.
    /// @param account The address to check.
    /// @return True if the account holds the role.
    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role] == account;
    }

    // ─── Parameter Management ────────────────────────────────────────────

    /// @notice Get a constitutional parameter value.
    /// @param key The parameter key.
    /// @return The parameter value.
    function getParameter(bytes32 key) external view returns (uint256) {
        return _parameters[key];
    }

    /// @notice Amend a constitutional parameter. Only callable by the Referendum contract
    ///         after a successful amendment referendum.
    /// @param key The parameter key to amend.
    /// @param value The new value.
    function amendParameter(bytes32 key, uint256 value) external {
        if (msg.sender != _contracts[CONTRACT_REFERENDUM]) revert NotAuthorized();

        uint256 old = _parameters[key];
        _parameters[key] = value;

        emit ParameterAmended(key, old, value);
    }

    // ─── Contract Registry ───────────────────────────────────────────────

    /// @notice Amend a contract address (structural amendment). Only the Referendum
    ///         contract can call this — changing the architecture of government
    ///         requires a constitutional amendment by the people.
    /// @param name The contract key.
    /// @param newAddr The new contract address.
    function amendContract(bytes32 name, address newAddr) external {
        if (msg.sender != _contracts[CONTRACT_REFERENDUM]) revert NotAuthorized();

        address old = _contracts[name];
        _contracts[name] = newAddr;

        emit ContractAmended(name, old, newAddr);
    }

    /// @notice Get a registered contract address.
    /// @param name The contract key.
    /// @return The contract address.
    function getContract(bytes32 name) external view returns (address) {
        return _contracts[name];
    }

    /// @notice Finalize setup: wipe deployer after coronation and initial bootstrap.
    ///         Can be called by the deployer or by the Crown contract (auto-finalize
    ///         during coronation). Can only succeed once.
    function finalizeSetup() external {
        if (deployer == address(0)) revert AlreadyFinalized();
        if (msg.sender != deployer && msg.sender != _contracts[CONTRACT_CROWN]) revert NotAuthorized();
        deployer = address(0);
        emit SetupFinalized();
    }

    /// @notice Check if a parameter is protected from emergency amendment.
    /// @param key The parameter key.
    /// @return True if the parameter is protected.
    function isProtectedParameter(bytes32 key) external view returns (bool) {
        return _protectedParameters[key];
    }
}
