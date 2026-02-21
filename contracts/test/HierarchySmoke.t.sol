// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./helpers/TestBase.sol";
import "./helpers/MixinMajlis.sol";
import "./helpers/MixinCaretaker.sol";
import "./helpers/MixinGovernment.sol";
import "./helpers/MixinDeputy.sol";
import "./helpers/MixinSenate.sol";
import "./helpers/MixinJustices.sol";
import "./helpers/MixinCrownSuspension.sol";

// ═══════════════════════════════════════════════════════════════════════════
// Composable mixin smoke tests — one test per mixin combination
// ═══════════════════════════════════════════════════════════════════════════

/// @notice Base: GovTestBase only
contract SmokeL0 is GovTestBase {
    function test_L0_contractsDeployed() public view {
        assert(address(constitution) != address(0));
        assert(address(crown) != address(0));
        assert(address(parliament) != address(0));
        assert(constitution.getRole(ROLE_MONARCH) == monarchAddr);
    }
}

/// @notice Mixin: Majlis only
contract SmokeMixin_Majlis is GovTestBase, MixinMajlis {
    function setUp() public override {
        super.setUp();
        _setupMajlis();
    }

    function test_mixin_majlisSeated() public view {
        assertEq(parliament.majlisMemberCount(), 5);
        assertTrue(parliament.isMajlisMember(citizen1));
        assertTrue(parliament.isMajlisMember(citizen5));
    }
}

/// @notice Mixin: Majlis + Caretaker
contract SmokeMixin_MajlisCaretaker is GovTestBase, MixinCaretaker {
    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupCaretaker();
    }

    function test_mixin_caretakerActive() public view {
        assertTrue(executive.caretaker());
        assertEq(constitution.getRole(ROLE_PM), address(0));
    }
}

/// @notice Mixin: Majlis + Government
contract SmokeMixin_MajlisGovernment is GovTestBase, MixinGovernment {
    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupGovernment();
    }

    function test_mixin_governmentFormed() public view {
        assertEq(constitution.getRole(ROLE_PM), pmCandidate);
        assertFalse(executive.caretaker());
    }
}

/// @notice Mixin: Majlis + Government + Deputy
contract SmokeMixin_MajlisGovernmentDeputy is GovTestBase, MixinGovernment, MixinDeputy {
    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupGovernment();
        _setupDeputy();
    }

    function test_mixin_deputyDesignated() public view {
        assertEq(executive.deputyPM(), citizen1);
        assertFalse(executive.isDeputyOverdue());
    }
}

/// @notice KEY COMPOSITION: Senate WITHOUT Government (previously impossible)
contract SmokeMixin_MajlisSenate is GovTestBase, MixinMajlis, MixinSenate {
    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupSenate();
    }

    function test_mixin_senateWithoutGovernment() public view {
        assertEq(parliament.senateMemberCount(), 3);
        assertTrue(parliament.isSenateMember(citizen6));
        // No PM — government was never formed
        assertEq(constitution.getRole(ROLE_PM), address(0));
    }
}

/// @notice Mixin: Majlis + Government + Senate (same as old hierarchy)
contract SmokeMixin_FullStack is GovTestBase, MixinGovernment, MixinSenate {
    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupGovernment();
        _setupSenate();
    }

    function test_mixin_fullStackFormed() public view {
        assertEq(constitution.getRole(ROLE_PM), pmCandidate);
        assertEq(parliament.senateMemberCount(), 3);
    }
}

/// @notice Mixin: Full stack with Justices
contract SmokeMixin_FullStackJustices is GovTestBase, MixinGovernment, MixinJustices {
    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupGovernment();
        _setupSenate();
        _setupJustices();
    }

    function test_mixin_justicesSeated() public view {
        assertEq(court.activeJusticeCount(), 7);
    }
}

/// @notice KEY COMPOSITION: Justices WITHOUT Government (previously impossible)
contract SmokeMixin_JusticesWithoutGovernment is GovTestBase, MixinMajlis, MixinJustices {
    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupSenate();
        _setupJustices();
    }

    function test_mixin_justicesWithoutGovernment() public view {
        assertEq(court.activeJusticeCount(), 7);
        assertEq(constitution.getRole(ROLE_PM), address(0));
    }
}

/// @notice Mixin: Full stack with Crown suspension
contract SmokeMixin_CrownSuspension is GovTestBase, MixinGovernment, MixinCrownSuspension {
    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupGovernment();
        _setupSenate();
        _setupJustices();
        _setupCrownSuspension();
    }

    function test_mixin_crownSuspended() public view {
        assertTrue(crown.suspended());
        assertEq(constitution.getRole(ROLE_MONARCH), address(0));
    }
}

/// @notice KEY COMPOSITION: Crown suspension + Deputy (previously impossible)
contract SmokeMixin_SuspensionWithDeputy is GovTestBase, MixinGovernment, MixinDeputy, MixinCrownSuspension {
    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupGovernment();
        _setupDeputy();
        _setupSenate();
        _setupJustices();
        _setupCrownSuspension();
    }

    function test_mixin_suspensionWithDeputy() public view {
        assertTrue(crown.suspended());
        assertEq(executive.deputyPM(), citizen1);
    }
}

/// @notice KEY COMPOSITION: Caretaker + Justices (previously impossible)
contract SmokeMixin_CaretakerWithJustices is GovTestBase, MixinGovernment, MixinCaretaker, MixinJustices {
    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupGovernment();    // seat PM first
        _setupSenate();
        _setupJustices();
        _setupCaretaker();     // restart formation → caretaker
    }

    function test_mixin_caretakerWithJustices() public view {
        assertTrue(executive.caretaker());
        assertEq(court.activeJusticeCount(), 7);
    }
}
