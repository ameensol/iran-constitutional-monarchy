// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract GeneratedBallotVerifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 3769370332166462597043216262615088174840670471945416373295992226241140626780;
    uint256 constant alphay  = 6371402969355662954578209633787250599202985450908412061492962889741851721770;
    uint256 constant betax1  = 13990298534500544814052689781715854248288022271734073743962826188683863799867;
    uint256 constant betax2  = 16184049345043887097783295189901094063035433367724366816538240737914277995328;
    uint256 constant betay1  = 20434778528663534697044883138465214090213317169386527763371724235694200212624;
    uint256 constant betay2  = 16324873599706718553252035099060442150011799514394312481353555384601780394518;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 5671021383676654113293103613721989011958669430573529444158907328470453677439;
    uint256 constant deltax2 = 7712850742394450243134929951146482339189577251551754186804058936666221291334;
    uint256 constant deltay1 = 13859169400584521249052624554084126701769515825094129252334579756765733321862;
    uint256 constant deltay2 = 6857994851517462875683320207072366826700647769415721582721051776809728230859;

    
    uint256 constant IC0x = 2995912677265411094822726223852261250848274195248752158778327322030383853621;
    uint256 constant IC0y = 19124544840575506523852387780705218629827435632264395651945822807117048766104;
    
    uint256 constant IC1x = 9175238168460485418990729390924147383338545727983394628129741508358870979438;
    uint256 constant IC1y = 18952808196738505346204114402489266664831714945021430974403573473674693621892;
    
    uint256 constant IC2x = 13278673292349809795655383059287236436023000643745360724122408158991000552461;
    uint256 constant IC2y = 17846620558851415543836838466429552459359258073047549319814687962090905562432;
    
    uint256 constant IC3x = 18827578218915054578051411988367362456483653655661319351608398718861880945097;
    uint256 constant IC3y = 3610084159967190407876915011638888608409348691062062143157667265195714536814;
    
    uint256 constant IC4x = 16076224358034662914972583820052091364694179393853824057306595058117770591879;
    uint256 constant IC4y = 4676985822540079987286954627816074372026561140956175889217044621866543407174;
    
    uint256 constant IC5x = 2813800732861490178428672895641880998593583462549076359566972032155705706680;
    uint256 constant IC5y = 8626107595085192036824630585858177910053614146849350844508047838731519858376;
    
    uint256 constant IC6x = 1670446306637952452064464693874201193503661890059063958972975745237444161834;
    uint256 constant IC6y = 11313044575742018174097131189715408012616609367728125798037906112994739175959;
    
    uint256 constant IC7x = 21628367706519462260960137076613785273925824432512348014404949338160604103716;
    uint256 constant IC7y = 7736122546274355158943443649513918428123769068240506756183889028175309866397;
    
    uint256 constant IC8x = 7023376857802244717018769883830798221795691380129860044936593598831037677517;
    uint256 constant IC8y = 20863982043114551068750756293893005787576617337397878603467509861612943453832;
    
    uint256 constant IC9x = 21126607477716352050619664838154241565852332609955487202361436635599068827950;
    uint256 constant IC9y = 5868569644995364314821504956375471936433001742296680399840288364625803095646;
    
    uint256 constant IC10x = 3885210124722195820235491977859431978270396497835894729731119437727837221321;
    uint256 constant IC10y = 19631325315691291316973144816015912647392328455814631986855417108668527951998;
    
    uint256 constant IC11x = 18449849153254611172945994625317846084053311829826129352494652287896028301975;
    uint256 constant IC11y = 10905371167455578154153947552769501442939130824965039971293184532569851959903;
    
    uint256 constant IC12x = 2718283678928439768272448337273413042232827657741561578254992497078675081727;
    uint256 constant IC12y = 10813857187202930402815061204141726763132138705952216655295593571663195511809;
    
    uint256 constant IC13x = 20454285054610355182422253017306259248428018451860168372163042784676147133203;
    uint256 constant IC13y = 4937119045882392493570861100321958301816558052786852402013920294449452621508;
    
    uint256 constant IC14x = 20574378534936235710618796042269206718181536791032157431712334679813693707499;
    uint256 constant IC14y = 8213525916238606074006229115841954232658844547659156520634176396320904474742;
    
    uint256 constant IC15x = 6281076782505247506526316323560713942035568073321861875639419039170175159512;
    uint256 constant IC15y = 4158832466219595575725745000837786829939973776039856739275362261656812196504;
    
    uint256 constant IC16x = 20105176033607798261650469859862417117656682501674193597289549481394262442644;
    uint256 constant IC16y = 13075530018111130841466568794270300403611426016434081486776264854498163218893;
    
    uint256 constant IC17x = 12133320120653052085260273166813113874254985212437922226871889234068064510206;
    uint256 constant IC17y = 7082289827545187058039127823133207559764778338212120133298803989314724893336;
    
    uint256 constant IC18x = 8806597682735880259675045393605738190094660062271901560578680181941571590911;
    uint256 constant IC18y = 4991665263438492780038097094682514233339095288991674726316849375926592420356;
    
    uint256 constant IC19x = 14000579339645085452096226846223715240301053032467711566387369776325219271154;
    uint256 constant IC19y = 17866100158265222631197947015639571133165952551694751931755747661308923084028;
    
    uint256 constant IC20x = 12768005815523928636240309716133595296008336403858502400408507203618197220842;
    uint256 constant IC20y = 21300705769422730343061858260175881215575930106003226809451078891208789588495;
    
    uint256 constant IC21x = 11988229032378416057512203355657933802693521955270468397335979539970126949021;
    uint256 constant IC21y = 19852367757707136870316315500290355359180610989220356842664266611092188222397;
    
    uint256 constant IC22x = 1006540505018415326009608807116917170490982301845862020524430175373743294032;
    uint256 constant IC22y = 20318244599242154896051311260284487436343990397944355684928032553473114763475;
    
    uint256 constant IC23x = 14530120891967507623453847503636552459395107405083827456905894530874027916230;
    uint256 constant IC23y = 9123253413484593112250405400272476028814254044945619154092027440362024366440;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[23] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                
                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))
                
                g1_mulAccC(_pVk, IC11x, IC11y, calldataload(add(pubSignals, 320)))
                
                g1_mulAccC(_pVk, IC12x, IC12y, calldataload(add(pubSignals, 352)))
                
                g1_mulAccC(_pVk, IC13x, IC13y, calldataload(add(pubSignals, 384)))
                
                g1_mulAccC(_pVk, IC14x, IC14y, calldataload(add(pubSignals, 416)))
                
                g1_mulAccC(_pVk, IC15x, IC15y, calldataload(add(pubSignals, 448)))
                
                g1_mulAccC(_pVk, IC16x, IC16y, calldataload(add(pubSignals, 480)))
                
                g1_mulAccC(_pVk, IC17x, IC17y, calldataload(add(pubSignals, 512)))
                
                g1_mulAccC(_pVk, IC18x, IC18y, calldataload(add(pubSignals, 544)))
                
                g1_mulAccC(_pVk, IC19x, IC19y, calldataload(add(pubSignals, 576)))
                
                g1_mulAccC(_pVk, IC20x, IC20y, calldataload(add(pubSignals, 608)))
                
                g1_mulAccC(_pVk, IC21x, IC21y, calldataload(add(pubSignals, 640)))
                
                g1_mulAccC(_pVk, IC22x, IC22y, calldataload(add(pubSignals, 672)))
                
                g1_mulAccC(_pVk, IC23x, IC23y, calldataload(add(pubSignals, 704)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            
            checkField(calldataload(add(_pubSignals, 288)))
            
            checkField(calldataload(add(_pubSignals, 320)))
            
            checkField(calldataload(add(_pubSignals, 352)))
            
            checkField(calldataload(add(_pubSignals, 384)))
            
            checkField(calldataload(add(_pubSignals, 416)))
            
            checkField(calldataload(add(_pubSignals, 448)))
            
            checkField(calldataload(add(_pubSignals, 480)))
            
            checkField(calldataload(add(_pubSignals, 512)))
            
            checkField(calldataload(add(_pubSignals, 544)))
            
            checkField(calldataload(add(_pubSignals, 576)))
            
            checkField(calldataload(add(_pubSignals, 608)))
            
            checkField(calldataload(add(_pubSignals, 640)))
            
            checkField(calldataload(add(_pubSignals, 672)))
            
            checkField(calldataload(add(_pubSignals, 704)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
